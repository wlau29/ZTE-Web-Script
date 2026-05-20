# ZTE-Script

Depending on the device you own, you must choose the correct version of the script.  
Since the internal API of the routers changed, the versions are **not compatible** with each other.

## NG

**Compatible Routers:** ZTE G5TC and later.
This script is a total rewrite.

![ZTE-Script-NG](img/ng.png)

## MC8020

**Compatible Routers:** ZTE MC8020 (firmware CR_CNHKHKTMC8020V1.0.0B15 and similar).

For the MC8020, use the dedicated [mc8020.js](mc8020.js) script. It uses the goform API with SHA256 authentication and supports 4G/5G band locking, cell locking, network mode selection, and bridge mode.

**IMPORTANT WARNINGS:**

- **Power cycle required after band lock:** After changing band lock settings, you must **fully power cycle** the router (unplug from power, wait a few seconds, plug back in). A soft reboot through the web interface is NOT sufficient — the radio will not apply the new band configuration until a cold boot.

- **Cell lock prerequisites:** Before performing a cell lock, you must ensure that:
  1. **Band lock is cleared** (set to AUTO/all bands), OR
  2. **Band lock includes the band** that the target cell operates on.

  If the target cell's band is not unlocked/included in the band lock, the cell lock will fail or the device will show "NO SERVICE".

## Legacy

Compatible Routers: ZTE MC7010, MC888, MC889, and many others.

**WARNING:**

If you are using one of these routers, turn off automatic firmware updates.
Future updates (such as B19 for the MC889) will make this script unusable.
Band locking will no longer be possible, as ZTE has broken the locking API in the firmware.

![ZTE-Script-Legacy](img/legacy.png)

---

See https://www.lteforum.at/mobilfunk/script-fuer-zte-router.20462 for more details.
