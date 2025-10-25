const products = [
  { id: 1, name: "The Stack Tee", price: 28 },
  { id: 2, name: "SSR Mug", price: 18 },
  { id: 3, name: "Framework Sticker Pack", price: 8 },
];

export async function get() {
  return (
    <article>
      <h2>Shop</h2>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.name} — ${product.price}
          </li>
        ))}
      </ul>
    </article>
  );
}
