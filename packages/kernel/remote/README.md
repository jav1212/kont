# @kontave/client-remote

This package owns protocol-neutral remote transport contracts and shared request
mechanics. Browser and native adapters provide platform requests while feature
adapters retain ownership of endpoint paths, authentication, and DTO mapping.

`createRequestCancellation` combines an owning operation's cancellation signal
with a finite timeout using `AbortController` and a timer. Call `dispose()` in a
`finally` block after consuming the response to remove the timer and event
listener, including when the request or response decoding fails.
