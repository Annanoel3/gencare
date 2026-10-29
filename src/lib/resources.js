// The Resources page's list: real US organizations, each checked on its own
// site or an official .gov page on Oct 29, 2026 (numbers and hours copied as
// published). Re-check before changing; programs and phone numbers move.
export const RESOURCES_CHECKED = 'October 2026';

// Resources that have a page for each state, or a search that takes a ZIP:
// the Resources page opens those on the family's own state or ZIP
// (Resources.jsx forHome). Links checked on Oct 29, 2026 against each site.
// "in the District of Columbia", "in Texas".
const THE = new Set(['DC', 'VI', 'MP']);
const inPlace = (code, name) => `in ${THE.has(code) ? 'the ' : ''}${name}`;
const slug = (name) => name.toLowerCase().replace(/[^a-z\s-]/g, '').trim().replace(/\s+/g, '-');

// shiphelp.org/ships/<state>/ (no program in American Samoa or the Northern
// Mariana Islands). Local names from SHIP's own contact list.
const SHIP_SLUG = { DC: 'district-of-columbia', VI: 'us-virgin-islands', PR: 'puerto-rico', GU: 'guam' };
const SHIP_NAMES = {
  AK: 'the Medicare Information Office', AR: 'SHIIP', CA: 'HICAP', CT: 'CHOICES', DE: 'the Delaware Medicare Assistance Bureau',
  FL: 'SHINE', GU: 'GUAM MAP', IA: 'SHIIP', ID: 'SHIBA', KS: 'SHICK', LA: 'SHIIP', MA: 'SHINE', MI: 'MMAP',
  MN: 'the Senior LinkAge Line', MO: 'CLAIM', NC: 'SHIIP', ND: 'SHIC', NH: 'NH SHIP–ServiceLink', NV: 'MAP', NY: 'HIICAP',
  OH: 'OSHIIP', OK: 'MAP', OR: 'SHIBA', PA: 'PA MEDI', SC: 'I-CARE', SD: 'SHIINE', TX: 'HICAP', VA: 'VICAP',
  VI: 'VISHIP', WA: 'SHIBA', WY: 'WSHIIP',
};

// Each state's assistive technology program, from at3center.net's list,
// with every link opened on Oct 29, 2026 (moved sites updated). Vermont's,
// Puerto Rico's and the Northern Mariana Islands' sites didn't load, so
// those keep at3center's list.
const AT_PROGRAMS = {
  AL: ['Alabama Assistive Technology Resource', 'https://accessingpotential.org/'],
  AK: ['Assistive Technology of Alaska', 'https://www.atlaak.org/'],
  AZ: ['Arizona Technology Access Program', 'https://aztap.org/'],
  AR: ['Increasing Capabilities Access Network', 'https://ar-ican.org/'],
  CA: ['Ability Tools', 'https://abilitytools.org/'],
  CO: ['Assistive Technology Program of Colorado', 'https://www.ucdenver.edu/center-for-innovative-design-and-engineering/community-engagement/colorado-assistive-technology-act-program'],
  CT: ['Connecticut Assistive Technology Program', 'https://cttechact.com/'],
  DE: ['Delaware Assistive Technology Initiative', 'https://www.cds.udel.edu/at/dati/'],
  DC: ['District of Columbia Assistive Technology Program', 'https://www.uls-dc.org/'],
  FL: ['Florida Alliance for Assistive Services and Technology', 'https://faast.org/'],
  GA: ['Georgia Tools for Life', 'https://gatfl.gatech.edu/'],
  GU: ['Guam System for Assistive Technology', 'https://www.gsatcedders.org/'],
  HI: ['Assistive Technology Resource Centers of Hawaii', 'https://atrc.org/'],
  ID: ['Idaho Assistive Technology Project', 'https://idahoat.org/'],
  IL: ['Illinois Assistive Technology Program', 'https://iltech.org/'],
  IN: ['Indiana Assistive Technology Act Project', 'https://www.eastersealstech.com/'],
  IA: ['Easterseals Iowa Assistive Technology Program', 'https://iowaat.org/'],
  KS: ['Assistive Technology for Kansans', 'https://atk.ku.edu/'],
  KY: ['Kentucky Assistive Technology Service Network', 'https://www.katsnet.org/'],
  LA: ['Louisiana Assistive Technology Access Network', 'https://www.latan.org/'],
  ME: ['Maine Consumer Information and Technology Training Exchange', 'https://mainecite.org/'],
  MD: ['Maryland Technology Assistance Program', 'https://mdod.maryland.gov/tap'],
  MA: ['MassAbility Assistive Technology Services', 'https://www.mass.gov/info-details/massability-assistive-technology-services'],
  MI: ['Michigan Assistive Technology Program', 'https://mi-at.org/'],
  MN: ['Minnesota STAR Program', 'https://mn.gov/admin/star/'],
  MS: ['Project START', 'https://www.mdrs.ms.gov/assistive-technology/project-start'],
  MO: ['Missouri Assistive Technology', 'https://at.mo.gov/'],
  MT: ['Montana Assistive Technology Program', 'https://montech.ruralinstitute.umt.edu/'],
  NE: ['Nebraska Assistive Technology Partnership', 'https://atp.nebraska.gov/'],
  NV: ['Nevada Assistive Technology Collaborative', 'https://www.adsd.nv.gov/programs/programs-for-persons-with-physical-disabilities/nevada-assistive-technology-collaborative-natc/'],
  NH: ['Assistive Technology in New Hampshire', 'https://iod.unh.edu/ATinNH'],
  NJ: ['Assistive Technology Advocacy Center', 'https://at4nj.org/'],
  NM: ['New Mexico Technology Assistance Program', 'https://www.tap.gcd.nm.gov/'],
  NY: ['New York State TRAID Program', 'https://www.justicecenter.ny.gov/traid-program'],
  NC: ['North Carolina Assistive Technology Program', 'https://www.ncdhhs.gov/divisions/employment-and-independence-people-disabilities/north-carolina-assistive-technology-program'],
  ND: ['North Dakota Assistive', 'https://ndassistive.org/'],
  OH: ['Assistive Technology of Ohio', 'https://atohio.org/'],
  OK: ['Oklahoma ABLE Tech', 'https://www.okabletech.org/'],
  OR: ['Access Technologies, Inc.', 'https://accesstechnologiesinc.org/'],
  PA: ['TechOWL (Technology for Our Whole Lives)', 'https://techowlpa.org/'],
  RI: ['Rhode Island Assistive Technology Access Partnership', 'https://ors.ri.gov/assistive-technology/assistive-technology-access-partnership-atap'],
  SC: ['South Carolina Assistive Technology Program', 'https://www.sc.edu/study/colleges_schools/medicine/centers_and_institutes_new/center_for_disability_resources/assistive_technology/index.php'],
  SD: ['DakotaLink', 'https://www.dakotalink.net/'],
  TN: ['Tennessee Technology Access Program', 'https://www.tn.gov/humanservices/ds/ttap.html'],
  TX: ['Texas Technology Access Program', 'https://ttap.disabilitystudies.utexas.edu/'],
  UT: ['Utah Assistive Technology Program', 'https://idrpp.usu.edu/uatp/'],
  VI: ['Technology Related Assistance for Individuals with Disabilities', 'https://viucedd.uvi.edu/'],
  VA: ['Virginia Assistive Technology System', 'https://dars.virginia.gov/assistive-technology/'],
  WA: ['Washington Assistive Technology Act Program', 'https://watap.org/'],
  WV: ['West Virginia Assistive Technology Systems', 'https://wvats.cedwvu.org/'],
  WI: ['Wisconsin Assistive Technology Program', 'https://www.dhs.wisconsin.gov/wistech/index.htm'],
  WY: ['Wyoming Assistive Technology Resources', 'https://www.uwyo.edu/wind/watr/'],
};

// The WIC contact for one state on fna.usda.gov (its own number per state).
const WIC_IDS = {
  AL: 289, AK: 288, AS: 312, AZ: 287, AR: 278, CA: 286, CO: 266, CT: 285, DE: 291, DC: 290, FL: 265, GA: 308,
  GU: 295, HI: 303, ID: 268, IL: 264, IN: 302, IA: 294, KS: 284, KY: 301, LA: 300, ME: 263, MD: 304, MA: 299,
  MI: 283, MN: 298, MS: 297, MO: 311, MT: 262, NE: 258, NV: 269, NH: 281, NJ: 279, NM: 307, NY: 261, NC: 260,
  ND: 270, MP: 313, OH: 276, OK: 271, OR: 296, PA: 273, PR: 277, RI: 293, SC: 259, SD: 292, TN: 306, TX: 309,
  UT: 274, VT: 275, VI: 280, VA: 267, WA: 310, WV: 272, WI: 282, WY: 305,
};

// Child Care Aware's page for each state (licensing, help paying for care,
// local referral agencies), as each state's link on its map lands. Guam,
// American Samoa and the Northern Mariana Islands have none.
const CHILD_CARE_AWARE = {
  AL: 'alabama-4', AK: 'alaska-8', AZ: 'arizona-5', AR: 'arkansas-6', CA: 'california-5', CO: 'colorado-7',
  CT: 'connecticut-6', DE: 'delaware-6', FL: 'florida-6', GA: 'georgia-6', HI: 'hawaii-7', ID: 'idaho-5',
  IL: 'illinois-6', IN: 'indiana-5', IA: 'iowa-7', KS: 'kansas-5', KY: 'kentucky-5', LA: 'louisiana-6',
  ME: 'maine-6', MD: 'maryland-6', MA: 'massachusetts-6', MI: 'michigan-5', MN: 'minnesota-7',
  MS: 'mississippi-5', MO: 'missouri-9', MT: 'montana-6', NE: 'nebraska-5', NV: 'nevada-8',
  NH: 'new-hampshire-6', NJ: 'new-jersey-5', NM: 'new-mexico-5', NY: 'new-york-6', NC: 'north-carolina-6',
  ND: 'north-dakota-5', OH: 'ohio-6', OK: 'oklahoma-6', OR: 'oregon-5', PA: 'pennsylvania-5',
  RI: 'rhode-island-5', SC: 'south-carolina-4', SD: 'south-dakota-5', TN: 'tennessee-6', TX: 'texas-6',
  UT: 'utah-5', VT: 'vermont-7', VA: 'virginia-6', WA: 'washington-6', WV: 'west-virginia-6',
  WI: 'wisconsin-6', WY: 'wyoming-5', DC: 'district-of-columbia-4', PR: 'puerto-rico-2',
  VI: 'u-s-virgin-islands-2',
};

// Parent Centers: one page per state, as listed in parentcenterhub.org's
// sitemap. Illinois, Tennessee and the Pacific territories have none, so
// they keep the national search.
const PARENT_CENTER_SKIP = new Set(['IL', 'TN', 'GU', 'AS', 'MP']);
const PARENT_CENTER_SLUG = { VI: 'virgin-islands-2' };


export const RESOURCE_GROUPS = [
  {
    key: 'local', icon: '📍', title: 'Find help near you', blurb: 'Local places by ZIP code, crisis support, reporting abuse',
    items: [
      {
        name: '211', url: 'https://211.org/about-us/your-local-211',
        phones: [{ number: '211' }], hours: 'Open 24/7',
        description: 'Talk to a local expert who connects you with help for food, housing, bills, health care and caregiving.',
      },
      {
        name: 'Eldercare Locator', url: 'https://eldercare.acl.gov/',
        phones: [{ number: '1-800-677-1116' }], hours: 'Mon–Fri, 8 a.m.–9 p.m. Eastern (chat too)',
        description: 'Government service that connects older adults and families to local help, including their Area Agency on Aging.',
      },
      {
        name: '988 Suicide & Crisis Lifeline', url: 'https://988lifeline.org/',
        phones: [{ label: 'Call or text', number: '988' }], hours: 'Open 24/7. Spanish: press 2. Veterans: press 1',
        description: 'Confidential support by call, text or chat for anyone in emotional distress, including worn-out caregivers.',
      },
      {
        name: 'Report elder abuse (U.S. Department of Justice)', url: 'https://www.justice.gov/elderjustice/find-help-or-report-abuse',
        description: "Find your state's Adult Protective Services to report suspected abuse of an older adult. In an emergency, call 911.",
      },
    ],
  },
  {
    key: 'caregivers', icon: '🤝', title: 'Support for caregivers', blurb: 'Someone to talk to, breaks, planning help',
    items: [
      {
        name: 'National Caregiver Help Desk (Caregiver Action Network)', url: 'https://www.caregiveraction.org/helpdesk/',
        phones: [{ number: '(855) 227-3640' }], hours: 'Mon–Fri, 8 a.m.–7 p.m. Eastern',
        description: 'Talk with a caregiving expert by phone or chat. Also has virtual support groups.',
      },
      {
        name: 'AARP Care Connect', url: 'https://www.aarp.org/caregiving/basics/support-line/',
        phones: [{ label: 'English', number: '1-877-333-5885' }, { label: 'Spanish', number: '1-888-971-2013' }], hours: 'Mon–Fri, 8 a.m.–8 p.m. Eastern',
        description: 'Free line that points caregivers to resources and local help. You don’t need to be an AARP member.',
      },
      {
        name: 'Family Caregiver Alliance', url: 'https://www.caregiver.org/',
        phones: [{ number: '1-800-445-8106' }], hours: 'Mon–Fri, 9 a.m.–5 p.m. Pacific',
        description: 'Free caregiver helpline, online planning tools and support groups.',
      },
      {
        name: 'Respite Locator (ARCH National Respite Network)', url: 'https://archrespite.org/caregiver-resources/respitelocator/',
        description: 'Find respite care near you: short breaks while someone else takes over the caregiving.',
      },
      {
        name: 'National Family Caregiver Support Program', url: 'https://acl.gov/programs/support-caregivers/national-family-caregiver-support-program',
        description: 'Counseling, training, support groups and respite for people caring for someone 60+. Reach it through the Eldercare Locator.',
      },
      {
        name: 'VA Caregiver Support Program', url: 'https://www.caregiver.va.gov',
        phones: [{ number: '1-855-260-3274' }], hours: 'Mon–Fri, 8 a.m.–8 p.m. Eastern',
        description: 'Support line and local VA caregiver teams for family members caring for a veteran.',
      },
    ],
  },
  {
    key: 'older', icon: '🧓', title: 'Caring for an older adult', blurb: 'Benefits, Medicare, meals, dementia, stroke',
    items: [
      {
        name: 'BenefitsCheckUp (National Council on Aging)', url: 'https://benefitscheckup.org/',
        description: 'Free online check that shows which programs could help an older adult pay for food, medicine, utilities and more.',
      },
      {
        name: 'Medicare', url: 'https://www.medicare.gov/',
        phones: [{ number: '1-800-633-4227' }], hours: 'Open 24/7 (except some federal holidays)',
        description: 'Official Medicare site and line for questions about what Medicare covers and costs.',
      },
      {
        name: 'SHIP (free Medicare counseling)', url: 'https://www.shiphelp.org/',
        phones: [{ number: '1-877-839-2675' }],
        description: 'Free, unbiased local help understanding Medicare choices. Your state may call it HICAP, SHINE or something similar.',
        forState: ({ code, name }) => {
          if (code === 'AS' || code === 'MP') return null;
          const local = SHIP_NAMES[code];
          return {
            url: `https://www.shiphelp.org/ships/${SHIP_SLUG[code] || slug(name)}/`,
            description: `Free, unbiased local help understanding Medicare choices ${inPlace(code, name)}${local ? `, where it's called ${local}` : ''}.`,
          };
        },
      },
      {
        name: 'Meals on Wheels America', url: 'https://www.mealsonwheelsamerica.org/find-meals-and-services/',
        description: 'Enter a ZIP code to find local meal delivery, mainly for adults 60+ who have trouble shopping or cooking.',
        forZip: (zip) => ({
          url: `https://www.mealsonwheelsamerica.org/find-meals-and-services/?pc=${encodeURIComponent(zip)}`,
          description: `Meal delivery near ${zip}, mainly for adults 60+ who have trouble shopping or cooking.`,
        }),
      },
      {
        name: "Alzheimer's Association Helpline", url: 'https://www.alz.org/help-support/resources/helpline',
        phones: [{ number: '800-272-3900' }], hours: 'Open 24/7, holidays too',
        description: 'Free help day and night for anyone dealing with Alzheimer’s or dementia, including caregivers.',
      },
      {
        name: 'Stroke Family Warmline (American Stroke Association)', url: 'https://www.stroke.org/speakwithus',
        phones: [{ number: '1-888-478-7653' }], hours: 'Mon–Fri, 8:30 a.m.–5 p.m. Central',
        description: 'Phone support for stroke survivors, their families and caregivers.',
      },
      {
        name: 'National Elder Fraud Hotline', url: 'https://ovc.ojp.gov/program/elder-fraud-abuse/national-elder-fraud-hotline',
        phones: [{ number: '833-372-8311' }], hours: 'Mon–Fri, 10 a.m.–6 p.m. Eastern',
        description: 'If an older adult has been scammed, a case manager helps report it and finds help.',
      },
    ],
  },
  {
    key: 'equipment', icon: '🦽', title: 'Equipment and supplies', blurb: 'Free or lower-cost walkers, wheelchairs, home safety',
    items: [
      {
        name: 'Medical equipment loan closets (through 211)', url: 'https://211.org/about-us/your-local-211',
        phones: [{ number: '211' }],
        description: 'Ask 211 for "medical equipment loans" to find places that lend wheelchairs, walkers, shower chairs and commodes. Call ahead.',
      },
      {
        name: 'State assistive technology programs', url: 'https://at3center.net/state-at-programs/',
        description: "Find your state's program. It lends equipment to try before buying and offers reused equipment for less.",
        forState: ({ code, name }) => {
          const p = AT_PROGRAMS[code];
          return p ? {
            name: p[0], url: p[1],
            description: `The assistive technology program ${inPlace(code, name)}. It lends equipment to try before buying and offers reused equipment for less.`,
          } : null;
        },
      },
      {
        name: 'Medicare equipment coverage', url: 'https://www.medicare.gov/coverage/durable-medical-equipment-dme-coverage',
        phones: [{ number: '1-800-633-4227' }],
        description: 'When Medicare helps pay for walkers, wheelchairs, hospital beds, oxygen and more, and where to find suppliers.',
      },
      {
        name: 'Rebuilding Together', url: 'https://rebuildingtogether.org/find-your-local-affiliate',
        description: 'Local groups that add grab bars, handrails and ramps, mainly for lower-income homeowners. Rules vary by area.',
      },
    ],
  },
  {
    key: 'kids', icon: '🧸', title: 'Kids and parents', blurb: 'Child care, parenting help, food, development',
    items: [
      {
        name: 'National Parent & Youth Helpline', url: 'https://parentsanonymous.org/helplines/',
        phones: [{ label: 'Call or text', number: '855-427-2736' }], hours: 'Open 24/7',
        description: 'Support for any parent or caregiver, and for kids and young people up to 25, in English, Spanish and more.',
      },
      {
        name: 'Child Care Aware of America', url: 'https://www.childcareaware.org/resources/ccrr-search/',
        description: 'Search for your local child care referral agency and help paying for care.',
        forState: ({ code, name }) => (CHILD_CARE_AWARE[code] ? {
          url: `https://www.childcareaware.org/state/${CHILD_CARE_AWARE[code]}/`,
          description: `Child care ${inPlace(code, name)}: your local referral agency, licensing and help paying for care.`,
        } : null),
      },
      {
        name: 'WIC', url: 'https://www.fna.usda.gov/wic/apply',
        description: 'Food help for pregnant or new moms and kids under 5. Check if you qualify and find your local office.',
        forState: ({ code, name }) => (WIC_IDS[code] ? {
          url: `https://www.fna.usda.gov/contacts?sort_bef_combine=title_fulltext_ASC&f%5B0%5D=fns_contact_related_programs%3A32&f%5B1%5D=fns_contact_state%3A${WIC_IDS[code]}`,
          description: `Food help for pregnant or new moms and kids under 5. Shows the WIC office ${inPlace(code, name).replace(/^in /, 'for ')}, with its phone number and website.`,
        } : null),
      },
      {
        name: 'Head Start', url: 'https://www.headstart.gov/center-locator',
        phones: [{ number: '1-866-763-6481' }], hours: 'Mon–Fri, noon–6 p.m. Eastern',
        description: 'Free early learning for children up to 5 in families with low income, foster care and more. Find a program near you.',
      },
      {
        name: 'Parent Centers (kids with disabilities)', url: 'https://www.parentcenterhub.org/find-your-center/',
        description: "Find your state's Parent Center, which helps families of kids with disabilities with school and development.",
        forState: ({ code, name }) => (PARENT_CENTER_SKIP.has(code) ? null : {
          url: `https://www.parentcenterhub.org/findurcenter/${PARENT_CENTER_SLUG[code] || slug(name)}/`,
          description: `Parent Centers ${inPlace(code, name)} help families of kids with disabilities with school and development.`,
        }),
      },
      {
        name: 'Learn the Signs. Act Early. (CDC)', url: 'https://www.cdc.gov/act-early/families/milestones-matter.html',
        description: 'Free milestone checklists and app for ages 2 months to 5 years, and what to do if you’re worried.',
      },
      {
        name: 'Grandparents raising grandkids (GrandFacts)', url: 'https://www.grandfamilies.org/State-Fact-Sheets',
        description: 'State-by-state help for grandparents and relatives raising children: programs, benefits, school and legal options.',
      },
      {
        name: 'National Diaper Bank Network', url: 'https://nationaldiaperbanknetwork.org/?p=1217',
        description: "Find a local diaper bank for free children's diapers, or dial 211.",
      },
    ],
  },
];
