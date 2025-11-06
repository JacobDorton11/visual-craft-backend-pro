// app.js — UMD globals
const React = window.React;
const ReactDOM = window.ReactDOM;
const { HashRouter, Routes, Route, Link, useNavigate } = window.ReactRouterDOM;

const API = window.__API_BASE__ ?? "";

function Card(props){ return React.createElement('div', { className:'a-card', style:props.style }, props.children); }
function Button({variant='dark', style, onClick, children}){
  const cls = variant==='dark'?'btn btn-dark':variant==='mid'?'btn btn-mid':'btn btn-ghost';
  return React.createElement('button', {className:cls, style, onClick}, children);
}

function NavBar(){
  return React.createElement('div',{className:'nav'},
    React.createElement(Link,{to:'/'}, React.createElement('strong',null,'Visual Craft')),
    React.createElement('div',{style:{marginLeft:'auto',display:'flex',gap:'12px'}},
      React.createElement(Link,{to:'/book'}, 'Book'),
      React.createElement(Link,{to:'/download'}, 'Download')
    )
  );
}

function Section({title, children}){
  return React.createElement('div',{className:'container'},
    React.createElement('h2',null,title),
    React.createElement(Card,{style:{background:'#fff',border:'1px solid #e5e5e5'}},children)
  );
}

const steps = ['Type','Package','Address','Time','Review'];
const listingTypes = [
  { key:'residential', label:'Residential Listing', img:'/public/images/residential.jpg' },
  { key:'land', label:'Land Listing', img:'/public/images/land.jpg' },
  { key:'commercial', label:'Commercial Listing', img:'/public/images/commercial.jpg' },
];
const packages = [
  { key:'silver', label:'Silver Package', minutes:60, desc:'Professional photography of interior and exterior of property.' },
  { key:'gold', label:'Gold Package', minutes:90, desc:'Professional photography of interior and exterior of property, and a Video Walkthrough Tour.' },
  { key:'platinum', label:'Platinum Package', minutes:120, desc:'Professional photography of interior and exterior of property. A Video Walkthrough Tour, Drone Video and Photography, as well as floor plan illustrations.' },
];

function Stepper({current}){
  return React.createElement('div',{style:{display:'flex',gap:'12px',justifyContent:'center',margin:'16px auto 8px',maxWidth:'720px'}},
    steps.map((s,i)=>React.createElement('div',{key:s,style:{
      padding:'8px 12px',borderRadius:'999px',border:'1px solid #e5e5e5',
      background:i===current?'#111':i<current?'#4d4d4d':'#fff',
      color:(i===current||i<current)?'#fff':'#111'
    }},s))
  );
}

function Splash(){
  return React.createElement('div',{className:'splash-bg'},
    React.createElement('div',{className:'center-card'},
      React.createElement(Card,null,
        React.createElement('h1',null,'Visual Craft Photography'),
        React.createElement('p',null,'Sign in or create an account'),
        React.createElement('div',{className:'grid'},
          React.createElement(Button,{variant:'dark'},'Log in'),
          React.createElement(Button,{variant:'mid'},'Create account')
        ),
        React.createElement('div',{className:'pill-share'},
          React.createElement('div',null,React.createElement('a',{href:'#/download',style:{color:'#111',textDecoration:'none'}},'Share'))
        )
      )
    )
  );
}

function BookingFlow(){
  const nav = useNavigate();
  const [step,setStep] = React.useState(0);
  const [form,setForm] = React.useState({ listingType:null, pkg:null, place:null, slot:null });
  const [query,setQuery] = React.useState('');

  const mockPlaces = React.useMemo(()=>[
    { label:'4718 Lake Park Dr. Unit #2 Johnson City, TN 37615', lat:36.3671, lng:-82.3709 },
    { label:'123 Main St, Asheville, NC', lat:35.5951, lng:-82.5515 },
  ],[]);
  const [results,setResults] = React.useState(mockPlaces);

  // Optional Google Places: works when Maps script is uncommented in index.html
  React.useEffect(()=>{
    function initPlaces(){
      const input = document.getElementById('addr-input');
      if (!input || !window.google || !window.google.maps?.places) return;
      const ac = new window.google.maps.places.Autocomplete(input,{ fields:['formatted_address','geometry'] });
      ac.addListener('place_changed', ()=>{
        const p = ac.getPlace();
        if (p?.geometry?.location){
          const lat = p.geometry.location.lat();
          const lng = p.geometry.location.lng();
          const label = p.formatted_address || input.value;
          setResults([{ label, lat, lng }]);
        }
      });
    }
    window.initPlaces = initPlaces;
    if (window.google?.maps?.places) initPlaces();
  },[]);

  React.useEffect(()=>{
    if (!(window.google?.maps?.places)){
      setResults(mockPlaces.filter(p => p.label.toLowerCase().includes(query.toLowerCase())));
    }
  },[query,mockPlaces]);

  const [slots,setSlots] = React.useState({ list:[], duration:60 });
  React.useEffect(()=>{
    (async()=>{
      if(!form.pkg) return;
      try {
        const r = await fetch(API + '/api/availability', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ pkg: form.pkg.label, days: 14 })
        });
        const j = await r.json();
        setSlots({ list: j.slots || [], duration: j.durationMin || (form.pkg?.minutes||60) });
      } catch(e){
        setSlots({ list:[], duration: form.pkg?.minutes || 60 });
      }
    })();
  },[form.pkg]);

  function TypeStep(){
    return Section({title:'Choose a Listing Type', children:
      React.createElement('div',{className:'grid'},
        listingTypes.map(t=>React.createElement('button',{
          key:t.key, onClick:()=>{ setForm(f=>({ ...f, listingType:t.key })); setStep(1); },
          className:'tile'
        },
          React.createElement('img',{src:t.img, alt:t.label}),
          React.createElement('h3',null,t.label)
        ))
      )
    });
  }
  function PackageStep(){
    return Section({title:'Select a Package', children:
      React.createElement('div',{className:'grid'},
        packages.map(p=>React.createElement('button',{
          key:p.key, onClick:()=>{ setForm(f=>({ ...f, pkg:p })); setStep(2); },
          style:{ textAlign:'left', padding:'16px', borderRadius:'12px', border:'1px solid #e5e5e5', background:'#fff' }
        },
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}},
            React.createElement('div',null,
              React.createElement('div',{style:{fontSize:'18px'}},p.label),
              React.createElement('div',{style:{color:'#4d4d4d',marginTop:'4px'}},p.desc)
            ),
            React.createElement('div',{style:{fontSize:'14px',color:'#4d4d4d'}}, p.minutes + ' min')
          )))
      )
    });
  }
  function AddressStep(){
    return Section({title:'Property Address', children:
      React.createElement('div',{className:'grid',style:{gap:'16px'}},
        React.createElement('input',{ id:'addr-input', placeholder:'Search address (Google Maps)…', value:query, onChange:e=>setQuery(e.target.value), style:{ padding:'14px', borderRadius:'12px', border:'1px solid #e5e5e5' }}),
        React.createElement('div',{className:'grid'},
          results.map(r=>React.createElement('button',{
            key:r.label, onClick:()=>{ setForm(f=>({ ...f, place:r })); setStep(3); },
            style:{ textAlign:'left', padding:'12px', borderRadius:'12px', border:'1px solid #e5e5e5', background:'#fff' }
          }, r.label))
        )
      )
    });
  }
  function TimeStep(){
    return Section({title:'Select a Time', children:
      React.createElement('div',{className:'grid'},
        slots.list.length===0
          ? React.createElement('div',{style:{color:'#4d4d4d'}},'No available times (try another day).')
          : slots.list.map(iso=>{
              const label = new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
              return React.createElement('button',{
                key:iso, onClick:()=>{ setForm(f=>({ ...f, slot:{ startISO: iso }})); setStep(4); },
                style:{ textAlign:'left', padding:'14px', borderRadius:'12px', border:'1px solid #e5e5e5', background:'#fff', display:'flex', justifyContent:'space-between' }
              },
                React.createElement('span',null,label),
                React.createElement('span',{style:{color:'#4d4d4d'}}, slots.duration + ' min')
              );
            })
      )
    });
  }
  function ReviewStep(){
    const typeLabel = (listingTypes.find(t=>t.key===form.listingType)||{}).label || '';
    return Section({title:'Review & Confirm', children:
      React.createElement('div',{className:'grid'},
        React.createElement('div',null, React.createElement('strong',null,'Listing Type: '), typeLabel),
        React.createElement('div',null, React.createElement('strong',null,'Package: '), form.pkg?.label || ''),
        React.createElement('div',null, React.createElement('strong',null,'Address: '), form.place?.label || ''),
        React.createElement('div',null, React.createElement('strong',null,'Date & Time: '), new Date(form.slot?.startISO || Date.now()).toLocaleString()),
        React.createElement('div',{style:{display:'flex',gap:'12px',marginTop:'8px'}},
          React.createElement(Button,{variant:'dark', onClick: async()=>{
            const r = await fetch(API + '/api/book', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({
                listingType: typeLabel,
                pkg: form.pkg?.label,
                address: form.place?.label,
                lat: form.place?.lat, lng: form.place?.lng,
                startISO: form.slot?.startISO,
                name: 'Client', email: 'client@example.com', phone: '555-555-5555', notes: ''
              })
            });
            const j = await r.json();
            if (j.ok && j.code) window.location.hash = '#/confirm/' + j.code;
            else alert('Booking failed');
          }}, 'Confirm Appointment'),
          React.createElement(Button,{variant:'mid', onClick:()=>setStep(3)}, 'Back')
        )
      )
    });
  }

  return React.createElement('div',{style:{paddingBottom:'32px'}},
    React.createElement(Stepper,{current:step}),
    step===0? TypeStep():
    step===1? PackageStep():
    step===2? AddressStep():
    step===3? TimeStep():
    ReviewStep()
  );
}

function ConfirmPage(){
  const code = window.location.hash.split('/').pop();
  return Section({title:'Appointment Confirmed', children:
    React.createElement('div',{className:'center'},
      React.createElement('div',{style:{fontSize:'28px',marginBottom:'8px'}},'Confirmation #'),
      React.createElement('div',{style:{fontSize:'22px',marginBottom:'16px'}}, code || ''),
      React.createElement('div',{style:{color:'#4d4d4d',margin:'0 auto 16px',maxWidth:'560px',lineHeight:1.35}},'A confirmation email with an .ics invite will be sent. It includes a one-tap Reschedule link.'),
      React.createElement('div',{style:{display:'flex',justifyContent:'center',gap:'12px',flexWrap:'wrap',maxWidth:'560px',margin:'0 auto'}},
        React.createElement(Button,{variant:'mid',style:{minWidth:'260px'}},'Add to Calendar (ICS)'),
        React.createElement(Button,{variant:'dark',style:{minWidth:'260px'}},'Manage Booking')
      )
    )
  });
}

function DownloadPage(){
  return Section({title:'Download / Install', children:
    React.createElement('div',{className:'grid'},
      React.createElement('div',null, React.createElement('strong',null,'PWA (Web App): '), 'On iPhone Safari: Share → Add to Home Screen. On Android Chrome: ⋮ → Install App.'),
      React.createElement('div',null, React.createElement('strong',null,'App Icon: '), 'Placeholder icons in /public/icons/. Replace later.'),
      React.createElement('div',{style:{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}},
        React.createElement('img',{alt:'Icon 192',src:'/public/icons/icon-192.png',style:{width:'64px',height:'64px',borderRadius:'14px',border:'1px solid #e5e5e5'}}),
        React.createElement('img',{alt:'Icon 512',src:'/public/icons/icon-512.png',style:{width:'72px',height:'72px',borderRadius:'16px',border:'1px solid #e5e5e5'}})
      ),
      React.createElement('div',null, React.createElement('a',{href:'#/'},'Back to login'))
    )
  });
}

function App(){
  return React.createElement(HashRouter,null,
    React.createElement(NavBar,null),
    React.createElement(Routes,null,
      React.createElement(Route,{path:'/', element:React.createElement(Splash)}),
      React.createElement(Route,{path:'/book', element:React.createElement(BookingFlow)}),
      React.createElement(Route,{path:'/confirm/:code', element:React.createElement(ConfirmPage)}),
      React.createElement(Route,{path:'/download', element:React.createElement(DownloadPage)})
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
