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
      <article className="detail">
        <div className="detail-image"><img src={product.image} alt={product.name} width="900" height="900" /></div>
        <div className="detail-copy">
          <p className="eyebrow">{product.eyebrow} · SHORTLISTED PICK</p>
          <h1>{product.shortName}</h1>
          <p className="lead">{product.summary}</p>
          <dl className="metrics detail-metrics">
            <div><dt>From*</dt><dd>{product.price}</dd></div>
            <div><dt>Positive feedback</dt><dd>{product.positiveFeedback}</dd></div>
            <div><dt>Recent volume</dt><dd>{product.recentVolume}</dd></div>
          </dl>
          <a className="buy-link" href={product.affiliateUrl} target="_blank" rel="sponsored nofollow noopener">Check current price on AliExpress <span aria-hidden="true">↗</span></a>
          <p className="affiliate-note">Affiliate link: we may earn a commission if you buy, at no extra cost to you.</p>
        </div>
      </article>
      <section className="detail-notes">
        <div><p className="eyebrow">BEST FOR</p><ul>{product.bestFor.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><p className="eyebrow">CHECK BEFORE BUYING</p><ul>{product.checks.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </section>
      <p className="price-note">*AliExpress data checked {checkedAt} for delivery to Great Britain. Price, variant, tax, shipping, feedback and availability can change. We have not physically tested this item.</p>
      <footer><div><span className="brand-name">Clever Finds</span></div><div className="footer-links"><a href="/affiliate-disclosure">How we choose</a><a href="mailto:cleverfindspicks@gmail.com">Contact</a></div></footer>
    </main>
  );
}
