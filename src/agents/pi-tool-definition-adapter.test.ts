import type { AgentTool } from "@mariozechner/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toToolDefinitions } from "./pi-tool-definition-adapter.js";
import * as hookRunnerGlobal from "../plugins/hook-runner-global.js";

describe("pi tool definition adapter", () => {
  it("wraps tool errors into a tool result", async () => {
    const tool = {
      name: "boom",
      label: "Boom",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    const result = await defs[0].execute("call1", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "boom",
    });
    expect(result.details).toMatchObject({ error: "nope" });
    expect(JSON.stringify(result.details)).not.toContain("\n    at ");
  });

  it("normalizes exec tool aliases in error results", async () => {
    const tool = {
      name: "bash",
      label: "Bash",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    const result = await defs[0].execute("call2", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "exec",
      error: "nope",
    });
  });

  describe("before_tool_call hook", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("blocks tool execution when hook returns block=true", async () => {
      const executeSpy = vi.fn().mockResolvedValue({ details: { ok: true } });
      const tool = {
        name: "mytool",
        label: "My Tool",
        description: "does things",
        parameters: {},
        execute: executeSpy,
      } satisfies AgentTool<unknown, unknown>;

      const mockHookRunner = {
        hasHooks: vi.fn().mockReturnValue(true),
        runBeforeToolCall: vi.fn().mockResolvedValue({
          block: true,
          blockReason: "Not allowed for this session",
        }),
      };
      vi.spyOn(hookRunnerGlobal, "getGlobalHookRunner").mockReturnValue(
        mockHookRunner as unknown as ReturnType<typeof hookRunnerGlobal.getGlobalHookRunner>,
      );

      const defs = toToolDefinitions([tool], { sessionKey: "test:session" });
      const result = await defs[0].execute("call1", { foo: "bar" }, undefined, undefined);

      expect(result.details).toMatchObject({
        status: "blocked",
        tool: "mytool",
        error: "Not allowed for this session",
      });
      // Verify the actual tool was NOT executed
      expect(executeSpy).not.toHaveBeenCalled();
      // Verify hook was called with correct params
      expect(mockHookRunner.runBeforeToolCall).toHaveBeenCalledWith(
        { toolName: "mytool", params: { foo: "bar" } },
        { agentId: undefined, sessionKey: "test:session", toolName: "mytool" },
      );
    });

    it("allows execution when hook does not block", async () => {
      const executeSpy = vi.fn().mockResolvedValue({ details: { success: true } });
      const tool = {
        name: "mytool",
        label: "My Tool",
        description: "does things",
        parameters: {},
        execute: executeSpy,
      } satisfies AgentTool<unknown, unknown>;

      const mockHookRunner = {
        hasHooks: vi.fn().mockReturnValue(true),
        runBeforeToolCall: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(hookRunnerGlobal, "getGlobalHookRunner").mockReturnValue(
        mockHookRunner as unknown as ReturnType<typeof hookRunnerGlobal.getGlobalHookRunner>,
      );

      const defs = toToolDefinitions([tool], { sessionKey: "test:session" });
      const result = await defs[0].execute("call1", { foo: "bar" }, undefined, undefined);

      expect(result.details).toMatchObject({ success: true });
      expect(executeSpy).toHaveBeenCalled();
    });

    it("allows params modification by hook", async () => {
      const executeSpy = vi.fn().mockResolvedValue({ details: { success: true } });
      const tool = {
        name: "mytool",
        label: "My Tool",
        description: "does things",
        parameters: {},
        execute: executeSpy,
      } satisfies AgentTool<unknown, unknown>;

      const mockHookRunner = {
        hasHooks: vi.fn().mockReturnValue(true),
        runBeforeToolCall: vi.fn().mockResolvedValue({
          params: { foo: "modified" },
        }),
      };
      vi.spyOn(hookRunnerGlobal, "getGlobalHookRunner").mockReturnValue(
        mockHookRunner as unknown as ReturnType<typeof hookRunnerGlobal.getGlobalHookRunner>,
      );

      const defs = toToolDefinitions([tool], { sessionKey: "test:session" });
      await defs[0].execute("call1", { foo: "original" }, undefined, undefined);

      // Verify tool was called with modified params
      expect(executeSpy).toHaveBeenCalledWith("call1", { foo: "modified" }, undefined, undefined);
    });

    it("continues execution when hook throws", async () => {
      const executeSpy = vi.fn().mockResolvedValue({ details: { success: true } });
      const tool = {
        name: "mytool",
        label: "My Tool",
        description: "does things",
        parameters: {},
        execute: executeSpy,
      } satisfies AgentTool<unknown, unknown>;

      const mockHookRunner = {
        hasHooks: vi.fn().mockReturnValue(true),
        runBeforeToolCall: vi.fn().mockRejectedValue(new Error("Hook crashed")),
      };
      vi.spyOn(hookRunnerGlobal, "getGlobalHookRunner").mockReturnValue(
        mockHookRunner as unknown as ReturnType<typeof hookRunnerGlobal.getGlobalHookRunner>,
      );

      const defs = toToolDefinitions([tool], { sessionKey: "test:session" });
      const result = await defs[0].execute("call1", { foo: "bar" }, undefined, undefined);

      // Should still execute despite hook failure
      expect(result.details).toMatchObject({ success: true });
      expect(executeSpy).toHaveBeenCalled();
    });
  });
});
