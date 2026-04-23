export function beforeUpstream(_request) {
    return { action: "respond", status: 403, body: "should be ignored" };
}
export function onResponse(_response) {
    return { action: "respond", status: 403, body: "should be ignored" };
}
