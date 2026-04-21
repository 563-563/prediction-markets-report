#!/usr/bin/env python3
"""
export_csvs.py — Dune Analytics CSV exporter for the prediction-markets report.

Scans prediction-markets/ for CSV files whose names begin with a Dune query ID,
then either fetches the latest cached results or triggers a fresh execution.

Usage:
  python scripts/export_csvs.py [--refresh] [--skip-static]

Flags:
  --refresh      Trigger fresh query execution before downloading
                 (slower, uses Dune credits — recommended for daily CI)
  --skip-static  Skip queries marked as point-in-time snapshots that do not
                 change day-to-day (saves credits on daily runs)
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path

import requests

DUNE_API_KEY = os.environ.get("DUNE_API_KEY")
BASE_URL = "https://api.dune.com/api/v1"
CSV_DIR = Path("prediction-markets")

# Queries whose results are fixed historical analyses — no benefit from
# daily re-execution. To promote a query back to dynamic, remove it here.
STATIC_QUERY_IDS = {
    6767130,  # s2-09  polymarket liquidity quality — point-in-time snapshot
    6783184,  # s6-02  calibration curve
    6783185,  # s6-03  calibration error by probability bucket
    6783186,  # s6-04  calibration at extremes (1d vs 3+ months)
    6783187,  # s6-05  calibration error by time horizon
    6783188,  # s6-18  kalshi taker yes/no ratio by year
    6783189,  # s6-19  polymarket taker buy/sell ratio by year
    6783190,  # s6-20  kalshi taker PnL yes vs no
    6783191,  # s6-21  polymarket taker volume buy vs sell
    6783192,  # s6-06  bounce over time (quarterly)
    6783193,  # s6-07  price displacement by trade size
    6783194,  # s6-08  retail bounce
    6783195,  # s6-09  institutional bounce
    6783196,  # s6-10  retail price displacement over time
    6783198,  # s6-11  institutional price displacement over time
    6783200,  # s6-13  intraday spread patterns (24h)
    6783201,  # s6-01  institutional-grade markets ($10k within 1¢)
    6783202,  # s6-14  execution cliff — displacement by market decile
    6783203,  # s6-15  cohort displacement top 10% vs bottom 50%
    6783205,  # s6-16  long-tail tax ratio
    6783207,  # s6-17  market breadth
    6783208,  # s6-22  volume concentration power law
    6783209,  # s6-23  HHI concentration over time
    6823819,  # s7-2   settlement curve — spread widening near resolution
}

POLL_INTERVAL_S = 5
POLL_TIMEOUT_S = 300  # 5 minutes per query before giving up


def _headers():
    return {"X-Dune-API-Key": DUNE_API_KEY}


def execute_query(query_id: int) -> str:
    """Trigger a fresh execution. Returns execution_id."""
    resp = requests.post(
        f"{BASE_URL}/query/{query_id}/execute",
        headers=_headers(),
        json={"performance": "medium"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["execution_id"]


def wait_for_completion(execution_id: str, query_id: int) -> None:
    """Poll until the execution is done or raise on failure/timeout."""
    deadline = time.monotonic() + POLL_TIMEOUT_S
    while time.monotonic() < deadline:
        resp = requests.get(
            f"{BASE_URL}/execution/{execution_id}/status",
            headers=_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        state = resp.json()["state"]
        if state == "QUERY_STATE_COMPLETED":
            return
        if state in ("QUERY_STATE_FAILED", "QUERY_STATE_CANCELLED"):
            raise RuntimeError(f"Query {query_id} ended in state {state}")
        print(f"    [{query_id}] {state} — retrying in {POLL_INTERVAL_S}s")
        time.sleep(POLL_INTERVAL_S)
    raise TimeoutError(f"Query {query_id} did not complete within {POLL_TIMEOUT_S}s")


def download_execution_csv(execution_id: str) -> bytes:
    resp = requests.get(
        f"{BASE_URL}/execution/{execution_id}/results/csv",
        headers=_headers(),
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content


def download_latest_csv(query_id: int) -> bytes:
    """Fetch the most recent cached result without triggering re-execution."""
    resp = requests.get(
        f"{BASE_URL}/query/{query_id}/results/csv",
        headers=_headers(),
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content


def discover_queries() -> dict[int, Path]:
    """Scan CSV_DIR and return {query_id: filepath} for every CSV found."""
    pattern = re.compile(r"^(\d+)_")
    result = {}
    for path in sorted(CSV_DIR.glob("*.csv")):
        m = pattern.match(path.name)
        if m:
            result[int(m.group(1))] = path
    if not result:
        print(f"ERROR: no CSV files found in {CSV_DIR}/", file=sys.stderr)
        sys.exit(1)
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Export Dune CSVs for the prediction markets report"
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-execute queries before downloading (uses credits)",
    )
    parser.add_argument(
        "--skip-static",
        action="store_true",
        help="Skip snapshot/historical queries that don't change daily",
    )
    args = parser.parse_args()

    if not DUNE_API_KEY:
        print("ERROR: DUNE_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    queries = discover_queries()
    updated, skipped, failed = 0, 0, 0

    for query_id, filepath in queries.items():
        if args.skip_static and query_id in STATIC_QUERY_IDS:
            print(f"  SKIP   {filepath.name}")
            skipped += 1
            continue

        print(f"  FETCH  {filepath.name}")
        try:
            if args.refresh:
                execution_id = execute_query(query_id)
                wait_for_completion(execution_id, query_id)
                csv_bytes = download_execution_csv(execution_id)
            else:
                csv_bytes = download_latest_csv(query_id)

            filepath.write_bytes(csv_bytes)
            updated += 1
        except Exception as exc:
            print(f"  ERROR  {query_id}: {exc}", file=sys.stderr)
            failed += 1

    print(f"\nDone — {updated} updated, {skipped} skipped, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
