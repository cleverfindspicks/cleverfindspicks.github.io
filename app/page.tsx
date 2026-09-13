import { checkedAt, products } from './products';

export default function Home() {
  return (
    <main className="site-shell">
      <div className="brand-rule" />
      <header className="site-header">
        <a className="brand-lockup" href="/" aria-label="Clever Finds home">
          <img src="https://cleverfindspicks.github.io/clever-finds.png" alt="" width="42" height="42" />
          <span>Clever Finds</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#finds">Latest finds</a>
          <a href="/affiliate-disclosure">How we choose</a>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">SMALL-SPACE EDIT</p>
          <h1 id="hero-title">Useful finds.<br /><em>Fewer regrets.</em></h1>
          <p className="lead">Practical organisers shortlisted using buyer feedback, recent demand and value—not viral hype.</p>
          <a className="primary-link" href="#finds">See the latest finds <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-note" aria-label="Selection standard">
          <span className="note-number">98%</span>
          <p>positive buyer feedback on every product in this first edit</p>
        </div>
      </section>

      <section className="finds" id="finds" aria-labelledby="finds-title">
        <div className="section-heading">
          <div><p className="eyebrow">THE FIRST EDIT</p><h2 id="finds-title">Make small spaces work harder.</h2></div>
          <p>Data checked {checkedAt}. Prices and availability can change.</p>
        </div>
        <div className="product-grid">
          {products.map((product, index) => (
            <article className="product-card" key={product.slug}>
              <a className="product-image" href={`/finds/${product.slug}`} aria-label={`Read about ${product.shortName}`}>
                <span className="card-index">0{index + 1}</span>
                <img src={product.image} alt={product.name} width="700" height="700" loading={index ? 'lazy' : 'eager'} />
              </a>
              <div className="product-body">
                <p className="eyebrow">{product.eyebrow}</p>
                <h3><a href={`/finds/${product.slug}`}>{product.shortName}</a></h3>
                <p>{product.summary}</p>
                <dl className="metrics">
                  <div><dt>From*</dt><dd>{product.price}</dd></div>
                  <div><dt>Positive feedback</dt><dd>{product.positiveFeedback}</dd></div>
                </dl>
                <a className="text-link" href={`/finds/${product.slug}`}>See why it made the list <span aria-hidden="true">→</span></a>
              </div>
            </article>
          ))}
        </div>
        <p className="price-note">*Price returned by AliExpress for delivery to Great Britain when checked. Variant, tax, shipping and availability may change the final price.</p>
      </section>

      <section className="method" aria-labelledby="method-title">
        <p className="eyebrow">OUR FILTER</p>
        <h2 id="method-title">Useful first. Sellable second.</h2>
        <div className="method-grid">
          <p><strong>01</strong><span>Strong buyer feedback</span>We start at 95% positive feedback and look for enough recent activity to make the signal meaningful.</p>
          <p><strong>02</strong><span>A clear everyday job</span>Every pick must solve a visible problem without health, safety or performance hype.</p>
          <p><strong>03</strong><span>A checkout check</span>We flag dimensions, variants and delivery details you should verify before buying.</p>
        </div>
      </section>

      <footer>
        <div><span className="brand-name">Clever Finds</span><p>Independent product discovery for better-organised homes.</p></div>
        <div className="footer-links"><a href="/affiliate-disclosure">Affiliate disclosure</a><a href="mailto:cleverfindspicks@gmail.com">Contact</a></div>
        <p className="disclosure">We may earn a commission if you buy through our links, at no extra cost to you.</p>
      </footer>
    </main>
  );
}
