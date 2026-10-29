// The Resources page's list: real US organizations, each checked on its own
// site or an official .gov page on Oct 29, 2026 (numbers and hours copied as
// published). Re-check before changing; programs and phone numbers move.
export const RESOURCES_CHECKED = 'October 2026';

export const RESOURCE_GROUPS = [
  {
    key: 'local', icon: '📍', title: 'Find help near you', blurb: 'Local services, crisis support, reporting abuse',
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
      },
      {
        name: 'Meals on Wheels America', url: 'https://www.mealsonwheelsamerica.org/find-meals-and-services/',
        description: 'Enter a ZIP code to find local meal delivery, mainly for adults 60+ who have trouble shopping or cooking.',
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
        description: "Pick your state: its program lends equipment to try before buying and offers reused equipment for less.",
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
        description: 'Enter a ZIP code to find your local child care referral agency and help paying for care.',
      },
      {
        name: 'WIC', url: 'https://www.fna.usda.gov/wic/apply',
        description: 'Food help for pregnant or new moms and kids under 5. Check if you qualify and find your local office.',
      },
      {
        name: 'Head Start', url: 'https://www.headstart.gov/center-locator',
        phones: [{ number: '1-866-763-6481' }], hours: 'Mon–Fri, noon–6 p.m. Eastern',
        description: 'Free early learning for children up to 5 in families with low income, foster care and more. Find a program near you.',
      },
      {
        name: 'Parent Centers (kids with disabilities)', url: 'https://www.parentcenterhub.org/find-your-center/',
        description: "Pick your state to find its Parent Center, which helps families of kids with disabilities with school and development.",
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
