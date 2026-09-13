const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) return null;
  const bootstrap = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:true});`;
  return <>
    <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`} />
    <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
  </>;
}
