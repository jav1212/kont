import assert from "node:assert/strict";
import test from "node:test";
import { KontaveRemoteFailure } from "@kontave/client-remote";
import { DomainError, ErrorCode } from "../src/core/domain/domain-error";
import { ApiRequestFailure } from "../src/shared/frontend/feedback/api-request-failure";
import { NETWORK_UNAVAILABLE_MESSAGE, WebFailureClassifier } from "../src/shared/frontend/feedback/web-failure-classifier";
import { WebIncidentReporter } from "../src/shared/frontend/feedback/web-incident-reporter";

const classifier = new WebFailureClassifier();
const response = (status: number, requestId?: string) => ({ status, headers: new Headers(requestId ? { "x-request-id": requestId } : {}) });

test("rejected API requests are expected and keep the server message", () => {
    const failure = new ApiRequestFailure(response(409), "El período está cerrado.", { error: "El período está cerrado.", errorCode: "KNT-20261027-ABCDEF12" });
    assert.deepEqual(classifier.classify(failure), { kind: "expected", code: "KNT-20261027-ABCDEF12", message: "El período está cerrado." });
});

test("server failures with an incident code are shown as already reported", () => {
    const failure = new ApiRequestFailure(response(500, "req-1"), "Ocurrió un error inesperado.", { errorCode: "KNT-20261027-ABCDEF12" });
    assert.equal(failure.requestId, "req-1");
    assert.deepEqual(classifier.classify(failure), { kind: "reported", referenceCode: "KNT-20261027-ABCDEF12", message: "Ocurrió un error inesperado." });
});

test("server failures without an incident code must be reported", () => {
    assert.equal(classifier.classify(new ApiRequestFailure(response(502), "Bad gateway")), null);
});

test("network failures become a connection message, not an incident", () => {
    assert.deepEqual(classifier.classify(new TypeError("Failed to fetch")), { kind: "expected", code: null, message: NETWORK_UNAVAILABLE_MESSAGE });
    assert.deepEqual(classifier.classify(new KontaveRemoteFailure("NETWORK_UNAVAILABLE", "offline")), { kind: "expected", code: null, message: NETWORK_UNAVAILABLE_MESSAGE });
});

test("programming errors are always reported", () => {
    assert.equal(classifier.classify(new TypeError("Cannot read properties of undefined (reading 'id')")), null);
    assert.equal(classifier.classify(new ReferenceError("x is not defined")), null);
    assert.equal(classifier.classify(new SyntaxError("Unexpected token <")), null);
    assert.equal(classifier.classify("boom"), null);
});

test("domain errors, legacy status errors, and plain public errors are expected", () => {
    assert.deepEqual(classifier.classify(DomainError.invalidInput("RIF inválido.")), { kind: "expected", code: ErrorCode.INVALID_INPUT, message: "RIF inválido." });
    const legacy = Object.assign(new Error("Sin permisos."), { status: 403, code: "PAYABLES_ACCESS_DENIED" });
    assert.deepEqual(classifier.classify(legacy), { kind: "expected", code: "PAYABLES_ACCESS_DENIED", message: "Sin permisos." });
    assert.deepEqual(classifier.classify(new Error("Selecciona una organización.")), { kind: "expected", code: null, message: "Selecciona una organización." });
});

test("remote repository outages are reported; remote business codes are expected", () => {
    assert.equal(classifier.classify(new KontaveRemoteFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "down", "req-9")), null);
    assert.equal(classifier.classify(new KontaveRemoteFailure("ACCOUNTING_REPOSITORY_UNAVAILABLE", "down", "req-10")), null);
    assert.equal(classifier.classify(new KontaveRemoteFailure("INTERNAL_ERROR", "No se pudo procesar la solicitud contable.", "req-11")), null);
    assert.deepEqual(classifier.classify(new KontaveRemoteFailure("INVALID_REQUEST", "Datos inválidos.")), { kind: "expected", code: "INVALID_REQUEST", message: "Datos inválidos." });
});

test("the incident reporter deduplicates repeated failures and stops at its page budget", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        return new Response(JSON.stringify({ data: { code: body.code } }), { status: 200 });
    }) as typeof fetch;
    try {
        const reporter = new WebIncidentReporter();
        const failure = { eventName: "web.save.failed", error: new TypeError("x is undefined"), publicMessage: "No se pudo guardar.", fingerprint: "save" };
        const first = await reporter.report(failure);
        const second = await reporter.report(failure);
        assert.equal(first.code, second.code);
        assert.equal(bodies.length, 1);
        assert.equal(bodies[0]?.eventName, "web.save.failed");
        assert.equal(bodies[0]?.technicalMessage, "x is undefined");

        for (let index = 0; index < 24; index += 1) await reporter.report({ ...failure, fingerprint: `save-${index}` });
        await assert.rejects(reporter.report({ ...failure, fingerprint: "over-budget" }), /budget/);
        assert.equal(bodies.length, 25);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("the incident reporter fails loudly when the endpoint rejects the report", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    try {
        await assert.rejects(new WebIncidentReporter().report({ eventName: "web.x", error: new Error("x"), publicMessage: "Fallo." }), /429/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
