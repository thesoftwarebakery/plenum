export async function onRequest(_request) {
    // Attempt a network call without net permissions -- should throw.
    await fetch("http://example.com");
    return { action: "continue" };
}
