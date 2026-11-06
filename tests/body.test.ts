import { it, expect } from "vitest";
import { boundedFormData } from "../src/lib/body";
it("bounds chunked uploads without trusting content-length", async () => {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    body: "a".repeat(100),
  });
  await expect(boundedFormData(request, 50)).rejects.toMatchObject({
    status: 413,
  });
});
it("returns a client error for a malformed multipart request", async () => {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    body: "broken",
  });
  await expect(boundedFormData(request, 100)).rejects.toMatchObject({
    status: 400,
  });
});
it("decodes a valid bounded upload", async () => {
  const form = new FormData();
  form.append("file", new File(["hello"], "test.jpg", { type: "image/jpeg" }));
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: form,
  });
  const result = await boundedFormData(request, 10000);
  expect((result.get("file") as File).name).toBe("test.jpg");
});
