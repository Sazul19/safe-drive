"""
Synthetic accelerometer dataset generator for vehicle crash severity classification.

v2 — simulates actual 2-second, 50Hz tri-axial accelerometer *waveforms* per
class (baseline gravity + road vibration noise + an optional damped-oscillation
impact event + sensor measurement noise + saturation clipping), then computes
the 8 statistical features from those simulated waveforms — the same way a
real windowing feature-extractor would. This is deliberately more work than
drawing the 8 target statistics directly, because independently-drawn stats
with non-overlapping per-class ranges (the v1 approach) produced a trivially
linearly-separable dataset (100% held-out accuracy), which is not a credible
stand-in for real sensor data.

Classes (post false-positive-class removal — see docs/ml/crash-severity-model-plan.md §2.1):
    0 = Normal driving (incl. potholes/speed bumps — no separate class for these)
    1 = Minor crash
    2 = Major crash

Realism knobs deliberately included so classes overlap instead of being
cleanly separable:
    - road_roughness is a per-window latent nuisance variable present in
      EVERY class (including crashes), so "normal" windows sometimes look
      noisier than "minor crash" windows.
    - impact amplitude is drawn from a heavy-tailed (gamma-jittered)
      distribution with class ranges that overlap at the boundary.
    - impact energy is split across axes with continuous random weights,
      not a binary lateral/longitudinal mask.
    - the accelerometer saturates at a fixed range (like a real MPU6050
      configured for high-G crash detection), which compresses the top end
      of the major-crash distribution and makes it harder to separate from
      a strong minor crash on magnitude alone.
    - independent per-sample sensor measurement noise is added after
      saturation, on top of the road-vibration noise.
"""

import numpy as np
import pandas as pd

np.random.seed(42)

ROWS_PER_CLASS = 2500
FS_HZ = 50            # simulated accelerometer sample rate
WINDOW_SECONDS = 2.0
N_SAMPLES = int(FS_HZ * WINDOW_SECONDS)  # 100 samples per window

SATURATION_G = 16.0    # sensor clipping range (MPU6050 high-G config)
SENSOR_NOISE_STD = 0.03  # post-saturation electrical/measurement noise


def simulate_window(class_id):
    """Simulate one 2-second tri-axial accelerometer window for a given class.

    Returns (x, y, z) arrays of length N_SAMPLES, in units of g.
    """
    t = np.arange(N_SAMPLES) / FS_HZ

    # ── Baseline: gravity dominant on Z, small random tilt on X/Y ──────────
    baseline_x = np.random.normal(0, 0.05)
    baseline_y = np.random.normal(0, 0.05)
    baseline_z = 1.0 + np.random.normal(0, 0.02)

    # ── Road vibration noise — present in every class, latent per-window ──
    road_roughness = np.random.uniform(0.02, 0.14)
    x = baseline_x + np.random.normal(0, road_roughness, N_SAMPLES)
    y = baseline_y + np.random.normal(0, road_roughness, N_SAMPLES)
    z = baseline_z + np.random.normal(0, road_roughness, N_SAMPLES)

    # ── Impact event (damped oscillation) for crash classes ────────────────
    if class_id in (1, 2):
        t0 = np.random.uniform(0.3, 1.2)  # onset time within the window

        if class_id == 1:  # minor crash
            base_amp = np.random.uniform(1.5, 4.5)
            tau = np.random.uniform(0.12, 0.30)      # faster decay
            freq = np.random.uniform(3.0, 9.0)
        else:  # major crash
            base_amp = np.random.uniform(3.5, 9.0)   # overlaps minor's top end
            tau = np.random.uniform(0.25, 0.65)      # slower, sustained decay
            freq = np.random.uniform(1.5, 5.0)

        # heavy-tailed amplitude jitter so some minor events hit hard and
        # some major events are comparatively mild — real crashes vary a lot
        amp_jitter = np.random.gamma(shape=2.0, scale=0.5) + 0.5
        amplitude = base_amp * amp_jitter

        envelope = np.where(
            t >= t0,
            amplitude * np.exp(-(t - t0) / tau) * np.sin(2 * np.pi * freq * (t - t0)),
            0.0,
        )

        # continuous random energy split across axes (not a binary mask)
        weights = np.random.dirichlet(np.ones(3))
        x = x + weights[0] * envelope
        y = y + weights[1] * envelope
        z = z + weights[2] * envelope

    # ── Sensor saturation (real accelerometers clip at their configured range) ──
    x = np.clip(x, -SATURATION_G, SATURATION_G)
    y = np.clip(y, -SATURATION_G, SATURATION_G)
    z = np.clip(z, -SATURATION_G, SATURATION_G)

    # ── Independent measurement noise, added after clipping ────────────────
    x = x + np.random.normal(0, SENSOR_NOISE_STD, N_SAMPLES)
    y = y + np.random.normal(0, SENSOR_NOISE_STD, N_SAMPLES)
    z = z + np.random.normal(0, SENSOR_NOISE_STD, N_SAMPLES)

    return x, y, z


def features_from_window(x, y, z):
    """Compute the 8 statistical features from a simulated raw window,
    matching what a real client-side windowing feature-extractor would do."""
    mag = np.sqrt(x**2 + y**2 + z**2)

    max_mag = mag.max()
    mean_mag = mag.mean()
    std_dev = mag.std()

    # zero-crossings of the mean-centered magnitude signal (vibration frequency proxy)
    centered = mag - mean_mag
    signs = np.sign(centered)
    signs[signs == 0] = 1
    zero_cross = int(np.sum(np.diff(signs) != 0))

    max_x = np.abs(x).max()
    max_y = np.abs(y).max()
    max_z = np.abs(z).max()

    # true Signal Magnitude Area: mean over time of sum of per-axis absolute values
    sma = np.mean(np.abs(x) + np.abs(y) + np.abs(z))

    return max_mag, mean_mag, std_dev, zero_cross, max_x, max_y, max_z, sma


def generate_class(class_id, n):
    rows = []
    for _ in range(n):
        x, y, z = simulate_window(class_id)
        rows.append(features_from_window(x, y, z))

    df = pd.DataFrame(
        rows,
        columns=["max_mag", "mean_mag", "std_dev", "zero_cross", "max_x", "max_y", "max_z", "SMA"],
    )
    df["LABEL"] = class_id
    return df


def main():
    frames = [
        generate_class(0, ROWS_PER_CLASS),  # normal (incl. potholes/bumps)
        generate_class(1, ROWS_PER_CLASS),  # minor crash
        generate_class(2, ROWS_PER_CLASS),  # major crash
    ]
    df = pd.concat(frames, ignore_index=True)

    # shuffle rows so classes are interleaved
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)

    out_path = "xgboost_crash_dataset.csv"
    df.to_csv(out_path, index=False)

    print(f"Saved {len(df)} rows to {out_path}\n")

    print("Class distribution:")
    print(df["LABEL"].value_counts().sort_index())

    print("\nStatistical summary by class:")
    summary = df.groupby("LABEL")[
        ["max_mag", "mean_mag", "std_dev", "zero_cross", "max_x", "max_y", "max_z", "SMA"]
    ].agg(["mean", "min", "max"])
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(summary)


if __name__ == "__main__":
    main()
