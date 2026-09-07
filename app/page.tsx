export default function Home() {
  return (
    <main className="brand-shell">
      <div className="brand-rule" />
      <header><span className="brand-name">Clever Finds</span><span className="status">Getting ready</span></header>
      <section className="intro">
        <img className="logo" src="/clever-finds.png" alt="Clever Finds" width="260" height="260" />
        <p className="eyebrow">CLEVER FINDS</p>
        <h1>A little discovery.<br /><em>A smarter choice.</em></h1>
        <p className="description">We’re preparing our first collection of useful product finds. Product recommendations and affiliate links are not live yet.</p>
        <a className="contact" href="mailto:cleverfindspicks@gmail.com">Contact Clever Finds <span aria-hidden="true">↗</span></a>
      </section>
      <footer><span>Independent product discovery</span><span>Our affiliate connection is being configured.</span></footer>
    </main>
  );
}
