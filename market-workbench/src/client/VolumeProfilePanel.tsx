import { useEffect, useState } from "react";
import type { Interval } from "../shared/market.js";
import type { VolumeProfileResult } from "../shared/chartStudies.js";

interface VolumeProfilePanelProps {
  interval: Interval;
  symbol: string;
}

type VolumeProfileResponse = VolumeProfileResult & {
  symbol: string;
  interval: Interval;
};

export default function VolumeProfilePanel({ interval, symbol }: VolumeProfilePanelProps) {
  const [profile, setProfile] = useState<VolumeProfileResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const query = new URLSearchParams({ symbol, interval, limit: "240", bins: "24" });
        const response = await fetch(`/api/volume-profile?${query}`);
        const body = (await response.json()) as VolumeProfileResponse | { error: string };
        if (!response.ok) throw new Error("error" in body ? body.error : "Volume profile request failed");
        if (active) {
          setProfile(body as VolumeProfileResponse);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load volume profile");
      }
    };

    setProfile(null);
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [interval, symbol]);

  const hasVolume = Boolean(profile?.totalVolume);

  return (
    <section className="volume-profile" aria-labelledby="volume-profile-title">
      <header className="volume-profile-header">
        <div><span className="eyebrow">PRICE DISTRIBUTION</span><h2 id="volume-profile-title">Volume profile</h2></div>
        <span>24 bins · 70% value area</span>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {hasVolume && profile ? (
        <>
          <div className="volume-profile-summary">
            <span>POC <strong>{formatPrice(profile.pointOfControl, symbol)}</strong></span>
            <span>VALUE AREA <strong>{formatPrice(profile.valueAreaLow, symbol)} – {formatPrice(profile.valueAreaHigh, symbol)}</strong></span>
            <span>VOL <strong>{formatCompact(profile.totalVolume)}</strong></span>
          </div>
          <div className="volume-profile-bins" role="img" aria-label={`${profile.bins.length} estimated volume bins from high to low price`}>
            {[...profile.bins].reverse().map((bin) => (
              <div className={`volume-profile-bin${bin.inValueArea ? " in-value-area" : ""}${bin.midpoint === profile.pointOfControl ? " point-of-control" : ""}`} key={bin.midpoint}>
                <span>{formatPrice(bin.midpoint, symbol)}</span>
                <div className="volume-profile-track"><i style={{ width: `${bin.relativeVolume * 100}%` }} /></div>
                <small>{formatCompact(bin.volume)}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="volume-profile-empty">{error || "Waiting for candle volume"}</p>
      )}
      <p className="volume-profile-note">Estimate only: each candle’s volume is assigned to its typical price, (high + low + close) / 3. Exact volume-at-price requires trade-level data.</p>
    </section>
  );
}

function formatPrice(value: number | null, symbol: string): string {
  if (value == null) return "—";
  const digits = symbol.startsWith("XRP") || symbol.startsWith("DOGE") ? 4 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}