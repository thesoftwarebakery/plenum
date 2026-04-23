/**
 * on_response interceptor: reads ctx written by the on_request interceptor
 * and reflects it back as response headers so the test can assert on them.
 */
export function readCtx(input) {
    return {
        action: 'continue',
        headers: {
            'x-ctx-user-tier': String(input.ctx?.userTier ?? 'not-set'),
            'x-ctx-gateway-route': String(input.ctx?.gatewayRoute ?? 'not-set'),
            'x-ctx-gateway-method': String(input.ctx?.gatewayMethod ?? 'not-set'),
        },
    };
}
