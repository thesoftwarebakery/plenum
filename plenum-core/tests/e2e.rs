use std::net::TcpListener;

use plenum_core::build_gateway;
use plenum_core::config::Config;

use pingora_core::server::Server;
use pingora_core::server::configuration::{Opt, ServerConf};
use pingora_proxy::http_proxy_service;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

fn start_gateway(upstream_host: &str, upstream_port: u16) -> String {
    let gateway_port = free_port();
    let listen = format!("127.0.0.1:{}", gateway_port);

    let doc = json!({
        "openapi": "3.1.0",
        "info": { "title": "Test", "version": "1.0" },
        "paths": {
            "/products": {
                "get": { "responses": { "200": { "description": "ok" } } },
                "x-plenum-upstream": { "$ref": "#/x-plenum-upstreams/default" }
            },
            "/products/{id}": {
                "get": { "responses": { "200": { "description": "ok" } } },
                "x-plenum-upstream": { "$ref": "#/x-plenum-upstreams/default" }
            }
        },
        "x-plenum-upstreams": {
            "default": {
                "kind": "HTTP",
                "address": upstream_host,
                "port": upstream_port
            }
        }
    });

    let config = Config::from_value(doc).unwrap();
    let gateway = build_gateway(&config, ".").unwrap();

    let conf = ServerConf {
        threads: 1,
        daemon: false,
        ..ServerConf::default()
    };

    let listen_addr = listen.clone();
    std::thread::spawn(move || {
        let mut server = Server::new_with_opt_and_conf(Opt::default(), conf);
        server.bootstrap();
        let mut proxy = http_proxy_service(&server.configuration, gateway);
        proxy.add_tcp(&listen_addr);
        server.add_service(proxy);
        server.run_forever();
    });

    // Wait for the gateway to start accepting connections
    for _ in 0..50 {
        if TcpListener::bind(format!("127.0.0.1:{}", gateway_port)).is_err() {
            // Port is in use — gateway is listening
            return listen;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    panic!("Gateway did not start in time");
}

#[tokio::test]
async fn proxies_get_to_upstream() {
    let mock_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/products"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"items": ["widget", "gadget"]})),
        )
        .mount(&mock_server)
        .await;

    let addr = mock_server.address();
    let gateway_addr = start_gateway(&addr.ip().to_string(), addr.port());

    let resp = reqwest::get(format!("http://{}/products", gateway_addr))
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body, json!({"items": ["widget", "gadget"]}));
}

#[tokio::test]
async fn proxies_parameterised_path() {
    let mock_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/products/abc-123"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(json!({"id": "abc-123", "name": "Widget"})),
        )
        .mount(&mock_server)
        .await;

    let addr = mock_server.address();
    let gateway_addr = start_gateway(&addr.ip().to_string(), addr.port());

    let resp = reqwest::get(format!("http://{}/products/abc-123", gateway_addr))
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["id"], "abc-123");
}

#[tokio::test]
async fn unmatched_path_returns_error() {
    let mock_server = MockServer::start().await;

    let addr = mock_server.address();
    let gateway_addr = start_gateway(&addr.ip().to_string(), addr.port());

    let resp = reqwest::get(format!("http://{}/nonexistent", gateway_addr))
        .await
        .unwrap();

    // pingora returns 502 when upstream_peer fails
    assert!(
        resp.status().is_server_error() || resp.status().as_u16() == 404,
        "Expected error status, got {}",
        resp.status()
    );
}
