"""Keep oracle-server above Oracle's Always Free idle threshold.

Oracle may stop an Always Free A1 instance when, over 7 days, its 95th-percentile
CPU, network and memory utilization are all below 20%. This holds a fixed block of
RAM (the main lever: it costs no CPU) and burns a little CPU as a backup. The
container's limits cap both, so it can never grow past them.
"""

import os
import time

HOLD_MB = int(os.environ.get("HOLD_MB", "3072"))
BURN_CPU = os.environ.get("BURN_CPU", "1") == "1"

# Writing every byte makes the pages resident; a zero-filled allocation would not be.
ballast = b"\x01" * (HOLD_MB * 1024 * 1024)
print(f"holding {HOLD_MB} MB; cpu burn {'on' if BURN_CPU else 'off'}", flush=True)

os.nice(19)
if BURN_CPU:
    # The compose file's `cpus` limit throttles this to a fixed share of a core.
    while True:
        pass
else:
    while True:
        time.sleep(3600)
