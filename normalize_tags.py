"""
normalize_tags.py — fix tag inconsistencies in annotations.json in-place.
Run once, then delete.

Usage:
    python scripts/normalize_tags.py --annotations "outputs/raw/.../annotations.json"
"""

import argparse
import json
from pathlib import Path

# single-box tag replacements: old → new
SINGLE_REMAP = {
    "right collar":      "collar right",
    "left hand grip":    "grip left hand",
    "grip left":         "grip left hand",
    "blurred":           "blur",
    "defends":           "defending",
}

# pair tag replacements: old → new
PAIR_REMAP = {
    "handfight":         "hand fight",
    "takedown attempt":  "takedown",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--annotations", required=True)
    args = ap.parse_args()

    path = Path(args.annotations)
    data = json.load(open(path, encoding="utf-8"))

    single_fixed = 0
    pair_fixed = 0

    for ann in data.values():
        for bbox in ann["bboxes"]:
            new_tags = []
            for tag in bbox["single_tags"]:
                remapped = SINGLE_REMAP.get(tag, tag)
                if remapped != tag:
                    single_fixed += 1
                new_tags.append(remapped)
            bbox["single_tags"] = new_tags

        new_pair_tags = []
        for pt in ann["pair_tags"]:
            remapped = PAIR_REMAP.get(pt["tag"], pt["tag"])
            if remapped != pt["tag"]:
                pair_fixed += 1
            new_pair_tags.append({**pt, "tag": remapped})
        ann["pair_tags"] = new_pair_tags

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Done. {single_fixed} single-box tags fixed, {pair_fixed} pair tags fixed.")
    print(f"Saved → {path}")


if __name__ == "__main__":
    main()
