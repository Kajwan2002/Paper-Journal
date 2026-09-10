import { describe, expect, it } from "vitest";
import { parseDue } from "@/lib/nldate";

const MON = "2026-09-07"; // a Monday

describe("parseDue", () => {
  it("files a trailing weekday and strips it from the text", () => {
    expect(parseDue("call mum friday", MON)).toEqual({
      text: "call mum",
      due: "2026-09-11",
    });
  });

  it("understands tomorrow and next week", () => {
    expect(parseDue("bins tomorrow", MON).due).toBe("2026-09-08");
    expect(parseDue("invoice next week", MON).due).toBe("2026-09-14");
  });

  it("understands a relative span", () => {
    expect(parseDue("chase in 3 days", MON).due).toBe("2026-09-10");
    expect(parseDue("review in 2 weeks", MON).due).toBe("2026-09-21");
  });

  it("leaves a bare date phrase alone — that is a note, not a task", () => {
    expect(parseDue("tomorrow", MON)).toEqual({ text: "tomorrow" });
    expect(parseDue("friday", MON)).toEqual({ text: "friday" });
  });

  it("only reads the end of the line", () => {
    expect(parseDue("friday night lights", MON)).toEqual({
      text: "friday night lights",
    });
    expect(parseDue("watch friday night lights", MON).due).toBeUndefined();
  });

  it("leaves ordinary lines untouched", () => {
    expect(parseDue("read the Dostoevsky", MON)).toEqual({
      text: "read the Dostoevsky",
    });
  });

  it("tidies the separator it leaves behind", () => {
    expect(parseDue("call mum — friday", MON).text).toBe("call mum");
    expect(parseDue("call mum, friday", MON).text).toBe("call mum");
  });
});
