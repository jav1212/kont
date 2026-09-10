import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

let user: { id: string } | null = null;

mock.module("@supabase/ssr", {
    namedExports: {
        createServerClient: () => ({
            auth: { getUser: async () => ({ data: { user } }) },
        }),
    },
});

const { middleware } = await import("../middleware");

test("admin recovery remains accessible before and after OTP verification, with or without the admin cookie", async () => {
    for (const sessionUser of [null, { id: "recovering-user" }]) {
        user = sessionUser;
        for (const cookie of ["", "kont-admin=1"]) {
            for (const path of ["/admin/forgot-password", "/admin/reset-password"]) {
                const response = await middleware(new NextRequest(`https://kont.test${path}`, { headers: { cookie } }));
                assert.equal(response.headers.get("location"), null);
                assert.equal(response.headers.get("x-middleware-next"), "1");
                assert.equal(response.headers.get("x-frame-options"), "DENY");
            }
        }
    }
});

test("recovery access does not open protected admin pages to ordinary or anonymous sessions", async () => {
    for (const [sessionUser, destination] of [[null, "/admin/sign-in"], [{ id: "ordinary-user" }, "/payroll"]] as const) {
        user = sessionUser;
        const response = await middleware(new NextRequest("https://kont.test/admin"));
        assert.equal(response.headers.get("location"), `https://kont.test${destination}`);
    }
});

test("admin sign-in still separates ordinary sessions from administrator sessions", async () => {
    user = { id: "signed-in-user" };
    const ordinaryResponse = await middleware(new NextRequest("https://kont.test/admin/sign-in"));
    assert.equal(ordinaryResponse.headers.get("location"), "https://kont.test/documents");
    const adminResponse = await middleware(new NextRequest("https://kont.test/admin/sign-in", {
        headers: { cookie: "kont-admin=1" },
    }));
    assert.equal(adminResponse.headers.get("location"), "https://kont.test/admin");
});
