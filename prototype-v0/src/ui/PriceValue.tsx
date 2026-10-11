import { priceLabel, priceConditions, type Priced } from "../priced";
export default function PriceValue({ price }: { price: Priced }) {
  return (
    <span className="qualified-price">
      <strong>{priceLabel(price)}</strong>
      <span>{priceConditions(price)}</span>
      {!price.known &&
        price.whoCanPrice?.map((p) => (
          <a key={p.operator} href={p.url} target="_blank" rel="noreferrer">
            Check with {p.operator}
          </a>
        ))}
    </span>
  );
}
