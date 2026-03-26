#!/usr/bin/env python3
"""Extract unique resistance/conferred sets from monster YAML into categorized JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


try:
    import yaml  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: PyYAML. Install with `pip install pyyaml` and rerun."
    ) from exc


def normalize_string_list(value: Any) -> list[str]:
    if value is None or not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def summarize_sets(resistances_set: set[str], conferred_set: set[str]) -> dict[str, Any]:
    both = resistances_set & conferred_set
    resistances_only = resistances_set - conferred_set
    conferred_only = conferred_set - resistances_set

    return {
        "categories": {
            "resistances": sorted(resistances_set),
            "conferred": sorted(conferred_set),
            "both": sorted(both),
            "resistances_only": sorted(resistances_only),
            "conferred_only": sorted(conferred_only),
        },
        "counts": {
            "resistances": len(resistances_set),
            "conferred": len(conferred_set),
            "both": len(both),
            "resistances_only": len(resistances_only),
            "conferred_only": len(conferred_only),
        },
    }


def extract_from_data(data: dict[str, Any]) -> tuple[set[str], set[str]]:
    monsters = data.get("monsters")
    if not isinstance(monsters, list):
        raise ValueError("Invalid YAML: expected top-level `monsters` list.")

    resistances_set: set[str] = set()
    conferred_set: set[str] = set()

    for monster in monsters:
        if not isinstance(monster, dict):
            continue
        resistances_set.update(normalize_string_list(monster.get("resistances")))
        conferred_set.update(normalize_string_list(monster.get("conferred")))

    return resistances_set, conferred_set


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError("Invalid YAML: expected a mapping at top level.")

    return data


def build_single_file_payload(path: Path) -> dict[str, Any]:
    data = load_yaml(path)
    resistances_set, conferred_set = extract_from_data(data)
    payload = summarize_sets(resistances_set, conferred_set)
    payload["source"] = str(path)
    return payload


def build_directory_payload(directory: Path) -> dict[str, Any]:
    yaml_files = sorted(p for p in directory.glob("*.yaml") if p.is_file())
    if not yaml_files:
        raise ValueError(f"No .yaml files found in directory: {directory}")

    all_resistances: set[str] = set()
    all_conferred: set[str] = set()
    files_payload: dict[str, Any] = {}

    for yaml_path in yaml_files:
        data = load_yaml(yaml_path)
        resistances_set, conferred_set = extract_from_data(data)
        all_resistances.update(resistances_set)
        all_conferred.update(conferred_set)
        files_payload[yaml_path.name] = summarize_sets(resistances_set, conferred_set)

    payload = summarize_sets(all_resistances, all_conferred)
    payload["source"] = str(directory)
    payload["files"] = files_payload
    payload["file_count"] = len(yaml_files)
    return payload


def default_output_path(input_path: Path) -> Path:
    if input_path.is_dir():
        return input_path / "all.resistance-conferred.json"
    return input_path.with_suffix(".resistance-conferred.json")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Extract unique resistances and conferred sets from one YAML file or "
            "all YAML files in a directory."
        )
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="resources/monsterDB",
        help="Input YAML file or directory (default: resources/monsterDB)",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=None,
        help=(
            "Output JSON path (default: <input>.resistance-conferred.json for file, "
            "or <input>/all.resistance-conferred.json for directory)"
        ),
    )

    args = parser.parse_args()
    input_path = Path(args.input)

    if not input_path.exists():
        raise SystemExit(f"Input not found: {input_path}")

    if input_path.is_dir():
        payload = build_directory_payload(input_path)
    else:
        payload = build_single_file_payload(input_path)

    output_path = Path(args.output) if args.output else default_output_path(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote categorized JSON to: {output_path}")


if __name__ == "__main__":
    main()
