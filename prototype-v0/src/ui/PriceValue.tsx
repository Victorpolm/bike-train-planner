import { priceLabel, priceConditions, type Priced } from "../priced";
export default function PriceValue({ price }: { price: Priced }) {
  return (
    <span className="qualified-price">
      <strong>{priceLabel(price)}</strong>
      <span>{priceConditions(price)}</span>
      {price.known && (
        <small>
          <a href={price.offer.provenance.source.url} target="_blank" rel="noreferrer">
            {price.offer.provenance.source.title}
          </a>
          {" · "}
          {price.offer.provenance.basis === "quoted" ? "Quote checked " : "Source reviewed "}
          {price.offer.provenance.checkedAt ?? price.offer.provenance.source.checked}
        </small>
      )}
      {!price.known &&
        price.whoCanPrice?.map((p) => (
          <a key={p.operator} href={p.url} target="_blank" rel="noreferrer">
            Check with {p.operator}
          </a>
        ))}
    </span>
  );
}
