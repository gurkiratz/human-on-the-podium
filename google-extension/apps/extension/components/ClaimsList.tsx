import type { Claim } from "@humanonthepodium/shared";

interface ClaimsListProps {
  claims: Claim[];
}

const STATUS_LABELS: Record<Claim["supportStatus"], string> = {
  not_checked: "Citation needed",
  supported: "Supported",
  unsupported: "Unsupported",
  uncertain: "Uncertain",
};

export function ClaimsList({ claims }: ClaimsListProps) {
  const uniqueClaims = Array.from(
    new Map(
      claims.map((claim) => [
        `${claim.claimType}:${claim.text.toLowerCase()}`,
        claim,
      ]),
    ).values(),
  );

  if (uniqueClaims.length === 0) {
    return null;
  }

  return (
    <div className="claims-list">
      {uniqueClaims.map((claim) => (
        <div key={claim.id} className="claim-item">
          <div className="claim-item__header">
            <span className="claim-item__type">{claim.claimType}</span>
            <span
              className={`claim-item__status claim-item__status--${claim.supportStatus}`}
            >
              {STATUS_LABELS[claim.supportStatus]}
            </span>
          </div>
          <p className="claim-item__text">{claim.text}</p>
        </div>
      ))}
    </div>
  );
}
