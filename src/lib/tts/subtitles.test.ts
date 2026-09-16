import { describe, expect, it } from "vitest";
import { parseSrt } from "@/lib/tts/subtitles";

describe("parseSrt", () => {
  it("parses edge-tts style SRT with comma milliseconds", () => {
    const srt = [
      "1",
      "00:00:00,100 --> 00:00:03,162",
      "第一句用来测试字幕时间轴。",
      "",
      "2",
      "00:00:03,112 --> 00:00:06,187",
      "第二句应该有不同的起止时间。",
      ""
    ].join("\n");
    expect(parseSrt(srt)).toEqual([
      { text: "第一句用来测试字幕时间轴。", startSec: 0.1, endSec: 3.162 },
      { text: "第二句应该有不同的起止时间。", startSec: 3.112, endSec: 6.187 }
    ]);
  });

  it("handles dot milliseconds, CRLF and multi-line cue text", () => {
    const vtt = "1\r\n00:00:01.000 --> 00:00:02.500\r\nhello\r\nworld\r\n";
    expect(parseSrt(vtt)).toEqual([{ text: "hello world", startSec: 1, endSec: 2.5 }]);
  });

  it("parses minutes and hours", () => {
    const srt = "1\n01:02:03,500 --> 01:02:04,000\n末尾\n";
    expect(parseSrt(srt)[0]).toEqual({ text: "末尾", startSec: 3723.5, endSec: 3724 });
  });

  it("skips malformed or zero-length blocks", () => {
    const srt = [
      "1",
      "not a timestamp",
      "ignored",
      "",
      "2",
      "00:00:05,000 --> 00:00:05,000",
      "zero length dropped",
      "",
      "3",
      "00:00:06,000 --> 00:00:07,000",
      "kept"
    ].join("\n");
    expect(parseSrt(srt)).toEqual([{ text: "kept", startSec: 6, endSec: 7 }]);
  });

  it("returns empty for empty input", () => {
    expect(parseSrt("")).toEqual([]);
  });
});
