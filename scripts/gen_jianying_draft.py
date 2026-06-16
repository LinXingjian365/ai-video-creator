"""把 AI 助手的 plan JSON 映射成真实剪映草稿。

用法: python gen_jianying_draft.py <config_json>
config_json 是 UTF-8 文件，含 {"draftsDir", "draftName", "plan"}。
中文（草稿名、素材路径、字幕文本）全部经 UTF-8 文件传入，避免 Windows
命令行 argv 编码丢失。成功时向 stdout 打印一行 JSON:
{"draftName": ..., "draftPath": ...}

plan 片段字段: type(video|audio|text), source, text, startMs, durationMs,
track, 可选 sourceInMs/sourceOutMs。
"""
import json
import os
import sys

import pyJianYingDraft as draft
from pyJianYingDraft import Timerange, TrackType

ASPECT_TO_SIZE = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
}

TYPE_TO_TRACK = {
    "video": TrackType.video,
    "audio": TrackType.audio,
    "text": TrackType.text,
}


def us(ms):
    return int(round(float(ms) * 1000))


def main():
    with open(sys.argv[1], encoding="utf-8") as fh:
        config = json.load(fh)

    drafts_dir = config["draftsDir"]
    draft_name = config["draftName"]
    plan = config["plan"]

    width, height = ASPECT_TO_SIZE.get(plan.get("aspectRatio", "16:9"), (1920, 1080))
    segments = plan.get("segments", [])

    folder = draft.DraftFolder(drafts_dir)
    script = folder.create_draft(draft_name, width, height, fps=30, allow_replace=True)

    # 按出现顺序建轨道（同类型可有多条，用 track 名区分）
    created_tracks = set()
    for seg in segments:
        track_name = seg.get("track") or "main"
        key = (seg["type"], track_name)
        if key in created_tracks:
            continue
        script.add_track(TYPE_TO_TRACK[seg["type"]], track_name)
        created_tracks.add(key)

    materials = {}  # source 路径 -> 素材对象（同源去重）

    def get_video_material(path):
        if path not in materials:
            mat = draft.VideoMaterial(path)
            script.add_material(mat)
            materials[path] = mat
        return materials[path]

    def get_audio_material(path):
        if path not in materials:
            mat = draft.AudioMaterial(path)
            script.add_material(mat)
            materials[path] = mat
        return materials[path]

    for seg in segments:
        track_name = seg.get("track") or "main"
        target = Timerange(us(seg["startMs"]), us(seg["durationMs"]))

        if seg["type"] == "video":
            mat = get_video_material(seg["source"])
            source_tr = None
            if seg.get("sourceInMs") is not None and seg.get("sourceOutMs") is not None:
                source_tr = Timerange(us(seg["sourceInMs"]), us(seg["sourceOutMs"] - seg["sourceInMs"]))
            script.add_segment(draft.VideoSegment(mat, target, source_timerange=source_tr), track_name)
        elif seg["type"] == "audio":
            mat = get_audio_material(seg["source"])
            source_tr = None
            if seg.get("sourceInMs") is not None and seg.get("sourceOutMs") is not None:
                source_tr = Timerange(us(seg["sourceInMs"]), us(seg["sourceOutMs"] - seg["sourceInMs"]))
            script.add_segment(draft.AudioSegment(mat, target, source_timerange=source_tr), track_name)
        elif seg["type"] == "text":
            script.add_segment(draft.TextSegment(seg.get("text", ""), target), track_name)

    script.save()
    draft_path = os.path.join(drafts_dir, draft_name)
    print(json.dumps({"draftName": draft_name, "draftPath": draft_path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
