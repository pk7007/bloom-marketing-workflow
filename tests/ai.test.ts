import { beforeEach, describe, it, expect, vi } from "vitest";
import { emptyState, type State } from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  state: null as unknown as State,
}));
vi.mock("openai", () => ({
  default: class {
    responses = { parse: mocks.parse };
  },
}));
vi.mock("../src/lib/store", () => ({
  mutate: async (fn: (s: State) => void) => {
    fn(mocks.state);
    return mocks.state;
  },
}));
vi.mock("../src/lib/supabase", () => ({
  assertLive: () => {},
  required: () => "test-model",
}));
import { generate } from "../src/lib/ai";
beforeEach(() => {
  mocks.state = emptyState();
  mocks.parse.mockReset();
  process.env.AI_MONTHLY_REQUEST_LIMIT = "2";
});
describe("AI failure handling and usage caps", () => {
  it("reserves usage before generation and records tokens", async () => {
    mocks.parse.mockResolvedValue({
      status: "completed",
      output_parsed: {
        options: [0, 1, 2].map(() => ({
          platform: "instagram",
          caption: "Hello",
          hashtags: [],
          claimsToVerify: [],
        })),
      },
      usage: { total_tokens: 100 },
    });
    const r = await generate({
      brief: "A new collection",
      platforms: ["instagram"],
    });
    expect(r.options).toHaveLength(3);
    expect(mocks.state.usage[0].status).toBe("success");
    expect(mocks.state.usage[0].tokens).toBe(100);
  });
  it("handles refusal without creating content", async () => {
    mocks.parse.mockResolvedValue({ status: "completed", output_parsed: null });
    await expect(
      generate({ brief: "A new collection", platforms: ["instagram"] }),
    ).rejects.toThrow("could not complete");
    expect(mocks.state.usage[0].status).toBe("failed");
    expect(mocks.state.contents).toHaveLength(0);
  });
  it("rejects malformed output and handles timeouts", async () => {
    mocks.parse.mockResolvedValue({
      status: "completed",
      output_parsed: { options: [] },
    });
    await expect(
      generate({ brief: "A new collection", platforms: ["instagram"] }),
    ).rejects.toThrow("incomplete");
    mocks.parse.mockRejectedValue(new Error("timeout"));
    await expect(
      generate({ brief: "A new collection", platforms: ["instagram"] }),
    ).rejects.toThrow("timed out");
  });
  it("enforces the cap including failed and reserved calls", async () => {
    mocks.parse.mockRejectedValue(new Error("timeout"));
    for (let i = 0; i < 2; i++)
      try {
        await generate({ brief: "A new collection", platforms: ["instagram"] });
      } catch {}
    await expect(
      generate({ brief: "A new collection", platforms: ["instagram"] }),
    ).rejects.toThrow("limit");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
  });
});

it("rejects an over-limit caption including the actual newline separator", async () => {
  mocks.parse.mockResolvedValue({
    status: "completed",
    output_parsed: {
      options: [0, 1, 2].map(() => ({
        platform: "instagram",
        caption: "a".repeat(2193),
        hashtags: ["#brand"],
        claimsToVerify: [],
      })),
    },
  });
  await expect(
    generate({ brief: "A new collection", platforms: ["instagram"] }),
  ).rejects.toThrow("invalid captions");
});
it("rejects blank captions and malformed hashtags", async () => {
  mocks.parse.mockResolvedValue({
    status: "completed",
    output_parsed: {
      options: [0, 1, 2].map(() => ({
        platform: "instagram",
        caption: " ",
        hashtags: ["two words"],
        claimsToVerify: [],
      })),
    },
  });
  await expect(
    generate({ brief: "A new collection", platforms: ["instagram"] }),
  ).rejects.toThrow("invalid captions");
});

it("records known token usage even if the completed output fails validation", async () => {
  mocks.parse.mockResolvedValue({
    status: "completed",
    usage: { total_tokens: 123 },
    output_parsed: { options: [] },
  });
  await expect(
    generate({ brief: "A collection", platforms: ["instagram"] }),
  ).rejects.toThrow("incomplete");
  expect(mocks.state.usage[0].tokens).toBe(123);
  expect(mocks.state.usage[0].status).toBe("failed");
});
