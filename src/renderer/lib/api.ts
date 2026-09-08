/**
 * The renderer's view of the app.
 *
 * A thin alias over the preload bridge rather than a wrapper: there is no
 * network, no serialisation and no error translation left to do, so anything
 * more here would be a layer that only forwards.
 */
export const api = window.salin
