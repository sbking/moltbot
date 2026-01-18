import { readRestartSentinel } from "../infra/restart-sentinel.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  connectOk,
  installGatewayTestHooks,
  onceMessage,
  startServerWithClient,
} from "./test-helpers.js";

installGatewayTestHooks();

const servers: Array<Awaited<ReturnType<typeof startServerWithClient>>> = [];

afterEach(async () => {
  for (const { server, ws } of servers) {
    try {
      ws.close();
      await server.close();
    } catch {
      /* ignore */
    }
  }
  servers.length = 0;
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("gateway config.apply", () => {
  it("writes config, stores sentinel, and schedules restart", async () => {
    const result = await startServerWithClient();
    servers.push(result);
    const { ws } = result;
    await connectOk(ws);

    const id = "req-1";
    ws.send(
      JSON.stringify({
        type: "req",
        id,
        method: "config.apply",
        params: {
          raw: '{ "agent": { "workspace": "~/clawd" } }',
          sessionKey: "agent:main:whatsapp:dm:+15555550123",
          restartDelayMs: 0,
        },
      }),
    );
    const res = await onceMessage<{ ok: boolean; payload?: unknown }>(
      ws,
      (o) => o.type === "res" && o.id === id,
    );
    expect(res.ok).toBe(true);

    const sentinel = await readRestartSentinel();
    expect(sentinel?.payload.kind).toBe("config-apply");
  });

  it("rejects invalid raw config", async () => {
    const result = await startServerWithClient();
    servers.push(result);
    const { ws } = result;
    await connectOk(ws);

    const id = "req-2";
    ws.send(
      JSON.stringify({
        type: "req",
        id,
        method: "config.apply",
        params: {
          raw: "{",
        },
      }),
    );
    const res = await onceMessage<{ ok: boolean; error?: unknown }>(
      ws,
      (o) => o.type === "res" && o.id === id,
    );
    expect(res.ok).toBe(false);
  });
});
