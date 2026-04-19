//! OS-level sandboxing for gateway plugin and interceptor processes.
//!
//! On Linux, processes are wrapped with bubblewrap (`bwrap`) to enforce
//! filesystem and network restrictions. Environment variable filtering is
//! applied on all platforms.
//!
//! On non-Linux platforms, any request for filesystem or network sandboxing
//! returns [`SandboxError::UnsupportedPlatform`] so that misconfigured
//! deployments fail loudly rather than silently bypassing restrictions.

use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::Command;

/// Sandboxing configuration for a single child process.
#[derive(Debug, Clone, Default)]
pub struct SandboxConfig {
    /// Permitted environment variable names. Empty means pass all through.
    pub env: Vec<String>,
    /// Paths (files or directories) the process may read.
    pub read: Vec<PathBuf>,
    /// Paths (files or directories) the process may read and write.
    pub write: Vec<PathBuf>,
    /// Outbound hostnames the process may connect to. Empty means block all
    /// network access. A value of `["*"]` grants unrestricted network access.
    pub net: Vec<String>,
}

impl SandboxConfig {
    /// Returns true if any filesystem or network restrictions are configured,
    /// meaning OS-level sandboxing is needed to enforce them.
    pub fn needs_os_sandbox(&self) -> bool {
        !self.read.is_empty() || !self.write.is_empty() || !self.net.is_empty()
    }
}

/// Errors returned by sandbox operations.
#[derive(Debug)]
pub enum SandboxError {
    /// The requested sandboxing is not supported on this platform.
    UnsupportedPlatform(String),
    /// An I/O error occurred while setting up the sandbox.
    Io(std::io::Error),
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SandboxError::UnsupportedPlatform(msg) => {
                write!(f, "sandboxing not supported on this platform: {msg}")
            }
            SandboxError::Io(e) => write!(f, "sandbox I/O error: {e}"),
        }
    }
}

impl std::error::Error for SandboxError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SandboxError::Io(e) => Some(e),
            _ => None,
        }
    }
}

/// Build a sandboxed [`Command`] that runs `program` with the given arguments.
///
/// Environment variable filtering (via `config.env`) is applied on all
/// platforms. Filesystem and network restrictions require Linux (bubblewrap).
///
/// On non-Linux platforms, returns [`SandboxError::UnsupportedPlatform`] if
/// `config.needs_os_sandbox()` is true.
pub fn wrap_command(
    program: impl AsRef<OsStr>,
    args: impl IntoIterator<Item = impl AsRef<OsStr>>,
    config: &SandboxConfig,
) -> Result<Command, SandboxError> {
    let program = program.as_ref();
    let args: Vec<std::ffi::OsString> = args.into_iter().map(|a| a.as_ref().to_owned()).collect();

    if config.needs_os_sandbox() {
        #[cfg(target_os = "linux")]
        return platform::wrap_bwrap(program, &args, config);

        #[cfg(not(target_os = "linux"))]
        return Err(SandboxError::UnsupportedPlatform(
            "filesystem/network sandboxing requires Linux (bubblewrap); \
             remove read/write/net permissions from the interceptor config \
             or deploy on a Linux host"
                .into(),
        ));
    }

    // No OS-level sandbox needed — just filter env vars and return a plain Command.
    let mut cmd = Command::new(program);
    cmd.args(&args);
    apply_env_filter(&mut cmd, &config.env);
    Ok(cmd)
}

/// Environment variables that must always be forwarded so that child processes
/// can find their binaries and shared libraries, regardless of the allow-list.
const ALWAYS_PASS: &[&str] = &["PATH", "LD_LIBRARY_PATH", "HOME", "TMPDIR"];

/// Filter the command's environment to only the allowed variable names.
/// If `allowed` is empty, the existing environment is left unchanged.
/// Essential variables (PATH etc.) are always forwarded even when filtering.
pub(crate) fn apply_env_filter(cmd: &mut Command, allowed: &[String]) {
    if allowed.is_empty() {
        return;
    }
    let filtered: Vec<(String, String)> = std::env::vars()
        .filter(|(k, _)| allowed.contains(k) || ALWAYS_PASS.contains(&k.as_str()))
        .collect();
    cmd.env_clear().envs(filtered);
}

// ---------------------------------------------------------------------------
// Linux bubblewrap implementation
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod platform {
    use super::{SandboxConfig, SandboxError, apply_env_filter};
    use std::ffi::OsStr;
    use std::ffi::OsString;
    use std::process::Command;

    /// Bind or symlink a system path inside bwrap.
    ///
    /// On modern Debian/Ubuntu systems `/lib` and `/lib64` are symlinks into
    /// `/usr`. Attempting `--ro-bind /lib /lib` on a symlink causes bwrap to
    /// bind-mount the target but still report "No such file or directory" when
    /// the dynamic linker searches for `/lib/ld-linux-*.so.*` because the
    /// sandbox root has no `/lib` directory entry.  Using `--symlink` instead
    /// recreates the correct filesystem layout inside the sandbox.
    fn bind_or_symlink(cmd: &mut Command, path: &std::path::Path) {
        // Use lstat so we check the path itself, not its target.
        match std::fs::symlink_metadata(path) {
            Ok(m) if m.file_type().is_symlink() => {
                if let Ok(target) = std::fs::read_link(path) {
                    // bwrap --symlink TARGET LINKNAME
                    cmd.arg("--symlink").arg(target).arg(path);
                }
            }
            Ok(_) => {
                cmd.arg("--ro-bind").arg(path).arg(path);
            }
            Err(_) => {}
        }
    }

    /// Wrap `program args` with bwrap.
    pub fn wrap_bwrap(
        program: &OsStr,
        args: &[OsString],
        config: &SandboxConfig,
    ) -> Result<Command, SandboxError> {
        let mut cmd = Command::new("bwrap");

        // Mount essential system paths read-only.
        // /usr is always a real directory; /lib and /lib64 are often symlinks into /usr.
        for sys_path in &["/usr", "/lib", "/lib64", "/etc"] {
            bind_or_symlink(&mut cmd, std::path::Path::new(sys_path));
        }
        // Architecture-specific lib directories (also may be symlinks).
        for arch_lib in &["/lib/x86_64-linux-gnu", "/lib/aarch64-linux-gnu"] {
            let p = std::path::Path::new(arch_lib);
            if p.exists() {
                cmd.arg("--ro-bind-try").arg(p).arg(p);
            }
        }

        // Virtual filesystems.
        cmd.arg("--dev").arg("/dev");
        cmd.arg("--proc").arg("/proc");
        cmd.arg("--tmpfs").arg("/tmp");

        // User-configured read-only paths.
        for path in &config.read {
            if path.exists() {
                cmd.arg("--ro-bind").arg(path).arg(path);
            } else {
                log::warn!(
                    "sandbox: read path '{}' does not exist, skipping",
                    path.display()
                );
            }
        }

        // User-configured read-write paths.
        for path in &config.write {
            cmd.arg("--bind").arg(path).arg(path);
        }

        // Network isolation: unshare network namespace unless hosts are allowed.
        // Note: selective per-host filtering (non-"*" entries like ["api.example.com"])
        // is not supported by bubblewrap alone; a firewall rule or seccomp filter
        // would be needed. For now, any non-empty net list grants full network access.
        if config.net.is_empty() {
            cmd.arg("--unshare-net");
        }

        // Isolation flags.
        cmd.arg("--unshare-pid");
        cmd.arg("--unshare-ipc");
        cmd.arg("--unshare-uts");
        cmd.arg("--new-session");
        cmd.arg("--die-with-parent");

        // The actual program and arguments.
        cmd.arg("--").arg(program).args(args);

        apply_env_filter(&mut cmd, &config.env);
        Ok(cmd)
    }
}
