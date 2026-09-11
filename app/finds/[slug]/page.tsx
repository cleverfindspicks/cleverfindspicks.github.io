import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { checkedAt, getProduct, products } from '../../products';

export function generateStaticParams() {
  return products.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  return { title: product.shortName, description: product.summary };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = getProduct((await params).slug);
  if (!product) notFound();

  return (
    <main className="site-shell detail-shell">
      <div className="brand-rule" />
      <header className="site-header">
        <a className="brand-lockup" href="/"><img src="https://cleverfindspicks.mohammdmadhar99.chatgpt.site/clever-finds.png" alt="" width="42" height="42" /><span>Clever Finds</span></a>
        <a className="back-link" href="/#finds">← All finds</a>
      </header>
      <article className="detail product-story">
        <div className="detail-image"><img src={product.image} alt={product.name} width="900" height="900" /></div>
        <div className="detail-copy">
          <p className="eyebrow">{product.eyebrow} · SHORTLISTED PICK</p>
          <h1>{product.shortName}</h1>
          <p className="lead">{product.summary}</p>
          <p className="story-intro">Small homes rarely need more things—they need each shelf, drawer and corner to work harder. This pick stood out because it tackles one clear storage problem without demanding a permanent remodel.</p>
          <dl className="metrics detail-metrics">
            <div><dt>From*</dt><dd>{product.price}</dd></div>
            <div><dt>Positive feedback</dt><dd>{product.positiveFeedback}</dd></div>
            <div><dt>Recent volume</dt><dd>{product.recentVolume}</dd></div>
          </dl>
          <a className="buy-link" href={product.affiliateUrl} target="_blank" rel="sponsored nofollow noopener">Check current price on AliExpress <span aria-hidden="true">↗</span></a>
          <p className="affiliate-note">Affiliate link: we may earn a commission if you buy, at no extra cost to you.</p>
        </div>
      </article>
      <section className="article-body" aria-label={`Why we shortlisted ${product.shortName}`}>
        <div className="article-main">
          <p className="eyebrow">WHY IT MADE THE EDIT</p>
          <h2>A practical upgrade for space you already have</h2>
          <p>{product.summary} The appeal is simple: it gives everyday items a clearer home, so the space is easier to use and quicker to reset.</p>
          <p>We shortlisted this option after weighing buyer feedback, recent demand and the usefulness of the idea for smaller UK homes. It is not a miracle fix, but it may remove a recurring bit of clutter with very little disruption.</p>
          <div className="editor-verdict">
            <span>THE CLEVER FINDS TAKE</span>
            <strong>Worth considering when the measurements fit and the delivered price still makes sense.</strong>
          </div>
          <h2>Where it can earn its keep</h2>
          <ul className="benefit-list">{product.bestFor.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
          <h2>Buy with your eyes open</h2>
          <p>AliExpress listings can combine several sizes, colours or quantities on one page. Treat the displayed price as a starting point and verify the exact option before paying.</p>
          <ol className="check-list">{product.checks.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ol>
        </div>
        <aside className="article-aside">
          <div className="sticky-buy">
            <p className="eyebrow">READY TO CHECK IT?</p>
            <h2>See the live listing</h2>
            <p>Confirm the current variant, delivery date and final price directly on AliExpress.</p>
            <a className="buy-link" href={product.affiliateUrl} target="_blank" rel="sponsored nofollow noopener">View on AliExpress <span aria-hidden="true">↗</span></a>
            <p className="affiliate-note">Sponsored affiliate link. You pay no extra; we may receive a commission.</p>
          </div>
        </aside>
      </section>
      <section className="detail-notes">
        <div><p className="eyebrow">BEST FOR</p><ul>{product.bestFor.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><p className="eyebrow">CHECK BEFORE BUYING</p><ul>{product.checks.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </section>
      <section className="newsletter-panel" aria-labelledby="newsletter-title">
        <div><p className="eyebrow">THE NEXT CLEVER FIND</p><h2 id="newsletter-title">Get new small-space picks by email.</h2></div>
        <p>One useful roundup, no clutter. The signup form will open here as soon as our mailing list is connected.</p>
      </section>
      <p className="price-note">*AliExpress data checked {checkedAt} for delivery to Great Britain. Price, variant, tax, shipping, feedback and availability can change. We have not physically tested this item.</p>
      <footer><div><span className="brand-name">Clever Finds</span></div><div className="footer-links"><a href="/affiliate-disclosure">How we choose</a><a href="mailto:cleverfindspicks@gmail.com">Contact</a></div></footer>
    </main>
  );
}
