//! Process lifecycle: spawning Node.js plugin servers and locating bundled scripts.

use std::error::Error;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::UnixStream;
use tokio::process::{Child, Command};

use crate::InterceptorPermissions;

/// Spawn a Node.js plugin server process and connect to it.
/// Returns `(child, stream, socket_path)`.
pub(super) async fn spawn_process(
    server_script: &Path,
    plugin_path: &str,
    socket_dir: &Path,
    permissions: &InterceptorPermissions,
) -> Result<(Child, UnixStream, PathBuf), Box<dyn Error + Send + Sync>> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let socket_path = socket_dir.join(format!(
        "og-plugin-{}-{}.sock",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    // Clean up any stale socket file.
    let _ = std::fs::remove_file(&socket_path);

    // Build sandbox config from permissions.
    // Infrastructure paths (server script, plugin, socket) are only added when
    // OS-level sandboxing will actually be applied, so that the platform guard
    // doesn't fire on non-Linux when the user hasn't configured any restrictions.
    let user_wants_os_sandbox =
        !permissions.allowed_read_paths.is_empty() || !permissions.allowed_hosts.is_empty();

    let sandbox_config = plenum_sandbox::SandboxConfig {
        env: permissions.allowed_env_vars.iter().cloned().collect(),
        read: {
            let mut r = permissions.allowed_read_paths.clone();
            if user_wants_os_sandbox {
                if let Some(d) = server_script.parent() {
                    r.push(d.to_path_buf());
                }
                if let Some(d) = std::path::Path::new(plugin_path).parent() {
                    r.push(d.to_path_buf());
                }
            }
            r
        },
        write: if user_wants_os_sandbox {
            vec![socket_dir.to_path_buf()]
        } else {
            vec![]
        },
        net: permissions.allowed_hosts.iter().cloned().collect(),
    };

    let node_args = [
        server_script.as_os_str().to_owned(),
        "--socket".into(),
        socket_path.as_os_str().to_owned(),
        "--plugin".into(),
        plugin_path.into(),
    ];
    let std_cmd = plenum_sandbox::wrap_command("node", node_args, &sandbox_config)
        .map_err(|e| format!("failed to configure sandbox: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to spawn node process: {e}"))?;

    // Wait for "ready\n" on stdout (10 second timeout).
    let stdout = child.stdout.take().ok_or("no stdout from child process")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            line.clear();
            let n = reader.read_line(&mut line).await?;
            if n == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "plugin process exited before becoming ready",
                ));
            }
            if line.trim() == "ready" {
                return Ok(());
            }
        }
    })
    .await
    .map_err(|_| "plugin process did not become ready within 10s")?
    .map_err(|e: std::io::Error| format!("error reading plugin stdout: {e}"))?;

    let stream = UnixStream::connect(&socket_path)
        .await
        .map_err(|e| format!("failed to connect to plugin socket at {socket_path:?}: {e}"))?;

    Ok((child, stream, socket_path))
}

/// Locate the bundled `server.js` for the node-runtime.
///
/// Resolution order:
///   1. `PLENUM_NODE_SERVER` env var (override for testing / custom deployments)
///   2. Alongside the gateway binary: `<binary_dir>/node-runtime/server.js`
///   3. Compile-time fallback: `<crate_dir>/node-runtime/server.js`
pub fn locate_server_script() -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    // 1. Explicit override.
    if let Ok(path) = std::env::var("PLENUM_NODE_SERVER") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
        return Err(
            format!("PLENUM_NODE_SERVER is set to '{path}' but the file does not exist").into(),
        );
    }

    // 2. Alongside the running binary.
    if let Ok(exe) = std::env::current_exe() {
        let candidate = exe
            .parent()
            .map(|d| d.join("node-runtime").join("server.js"));
        if let Some(p) = candidate
            && p.exists()
        {
            return Ok(p);
        }
    }

    // 3. Compile-time crate directory (dev / cargo test).
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("node-runtime")
        .join("server.js");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("cannot locate node-runtime/server.js: set PLENUM_NODE_SERVER or place it alongside the gateway binary".into())
}

/// Locate a built-in interceptor JS file in the node-runtime/interceptors/ directory.
pub fn locate_interceptor(name: &str) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let server_script = locate_server_script()?;
    let interceptor_dir = server_script
        .parent()
        .ok_or("server.js has no parent directory")?
        .join("interceptors");
    let path = interceptor_dir.join(format!("{name}.js"));
    if !path.exists() {
        return Err(format!(
            "built-in interceptor '{name}' not found at '{}'; \
             ensure the node-runtime is correctly installed",
            path.display()
        )
        .into());
    }
    Ok(path)
}

/// Locate a built-in plugin JS file in the node-runtime/plugins/ directory.
pub fn locate_plugin(name: &str) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    let server_script = locate_server_script()?;
    let plugin_dir = server_script
        .parent()
        .ok_or("server.js has no parent directory")?
        .join("plugins");
    let path = plugin_dir.join(format!("{name}.js"));
    if !path.exists() {
        return Err(format!(
            "built-in plugin '{name}' not found at '{}'; \
             ensure the node-runtime is correctly installed",
            path.display()
        )
        .into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locate_server_script_finds_dev_path() {
        let path = locate_server_script().expect("should find server.js in dev");
        assert!(path.exists());
        assert!(path.ends_with("node-runtime/server.js"));
    }

    #[test]
    fn locate_interceptor_finds_known_builtin() {
        let path = locate_interceptor("add-header").expect("add-header should exist");
        assert!(path.exists());
        assert!(path.ends_with("add-header.js"));
    }

    #[test]
    fn locate_interceptor_rejects_unknown() {
        let result = locate_interceptor("does-not-exist-xyz");
        assert!(result.is_err());
    }

    #[test]
    fn locate_plugin_rejects_unknown() {
        let result = locate_plugin("does-not-exist-xyz");
        assert!(result.is_err());
    }
}
