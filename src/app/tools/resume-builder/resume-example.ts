/**
 * The example resume behind "Load the example".
 *
 * Its own module, imported only when the button is pressed, so none of it is
 * in the prerendered page or the first download. Every person, company and
 * address in it is invented; the email domain is example.com, which is
 * reserved for exactly this.
 */
import { newId, type Resume, type ResumeEntry } from './resume';

function entry(fields: Partial<ResumeEntry>): ResumeEntry {
  return {
    id: newId(),
    hidden: false,
    title: '',
    subtitle: '',
    location: '',
    start: '',
    end: '',
    current: false,
    url: '',
    text: '',
    bullets: '',
    ...fields,
  };
}

export function exampleResume(): Resume {
  return {
    basics: {
      name: 'Jordan Ellis',
      headline: 'Senior Software Engineer',
      email: 'jordan.ellis@example.com',
      phone: '+44 20 7946 0958',
      location: 'Manchester, UK',
      website: 'jordanellis.example.com',
      links: [
        { id: newId(), label: 'LinkedIn', url: 'linkedin.com/in/jordan-ellis-example' },
        { id: newId(), label: 'GitHub', url: 'github.com/jordan-ellis-example' },
      ],
      photo: '',
    },
    sections: [
      {
        id: newId(),
        kind: 'summary',
        title: 'Summary',
        hidden: false,
        entries: [
          entry({
            text:
              'Full-stack engineer with nine years of experience building payment and ' +
              'logistics platforms in TypeScript and Go. I lead small teams through ' +
              'rewrites that keep the lights on, and I care about measurable results: ' +
              'faster pages, fewer incidents, and on-call rotas people do not dread.',
          }),
        ],
      },
      {
        id: newId(),
        kind: 'experience',
        title: 'Experience',
        hidden: false,
        entries: [
          entry({
            title: 'Senior Software Engineer',
            subtitle: 'Northwind Payments',
            location: 'Manchester, UK',
            start: '2021-03',
            current: true,
            bullets: [
              'Led a team of five rebuilding the checkout in Angular and Go; conversion rose 6.2% and p95 load time fell from 3.1 s to 1.2 s',
              'Designed an idempotent retry layer for card authorisations that cut duplicate charges to zero across 40 million transactions a year',
              'Introduced contract tests between 14 services, halving release rollbacks within two quarters',
              'Mentored four engineers, two of whom were promoted to senior',
            ].join('\n'),
          }),
          entry({
            title: 'Software Engineer',
            subtitle: 'Parcelwise',
            location: 'Leeds, UK',
            start: '2018-01',
            end: '2021-02',
            bullets: [
              'Built the route-planning API used by 1,200 drivers a day, in Go and PostgreSQL',
              'Moved nightly batch jobs to an event queue, so customers saw delivery updates in seconds instead of the next morning',
              'Wrote the on-call runbook and cut mean time to recovery from 74 to 22 minutes',
            ].join('\n'),
          }),
          entry({
            title: 'Junior Developer',
            subtitle: 'Brightside Digital',
            location: 'Leeds, UK',
            start: '2016-07',
            end: '2017-12',
            bullets: [
              'Shipped twelve client websites and e-commerce shops on tight deadlines',
              'Automated deployments with GitHub Actions, removing a two-hour manual release step',
            ].join('\n'),
          }),
        ],
      },
      {
        id: newId(),
        kind: 'skills',
        title: 'Skills',
        hidden: false,
        entries: [
          entry({ title: 'Languages', text: 'TypeScript, Go, SQL, Python' }),
          entry({ title: 'Frameworks', text: 'Angular, Node.js, gRPC, React' }),
          entry({ title: 'Platform', text: 'PostgreSQL, Kafka, Kubernetes, AWS, Terraform' }),
          entry({ title: 'Practices', text: 'System design, Code review, Incident response, Mentoring' }),
        ],
      },
      {
        id: newId(),
        kind: 'education',
        title: 'Education',
        hidden: false,
        entries: [
          entry({
            title: 'BSc (Hons) Computer Science, First Class',
            subtitle: 'University of Leeds',
            location: 'Leeds, UK',
            start: '2013-09',
            end: '2016-06',
            text: 'Dissertation on conflict-free replicated data types for offline-first apps.',
          }),
        ],
      },
      {
        id: newId(),
        kind: 'projects',
        title: 'Projects',
        hidden: false,
        entries: [
          entry({
            title: 'Ledgerline',
            subtitle: 'Open source, Go',
            url: 'github.com/jordan-ellis-example/ledgerline',
            text: 'A double-entry bookkeeping library with 1,400 GitHub stars, used in production by three fintech start-ups.',
          }),
        ],
      },
      {
        id: newId(),
        kind: 'certifications',
        title: 'Certifications',
        hidden: false,
        entries: [
          entry({ title: 'AWS Certified Solutions Architect, Associate', subtitle: 'Amazon Web Services', end: '2023-05' }),
          entry({ title: 'Certified Kubernetes Application Developer', subtitle: 'The Linux Foundation', end: '2022-11' }),
        ],
      },
      {
        id: newId(),
        kind: 'languages',
        title: 'Languages',
        hidden: false,
        entries: [
          entry({ title: 'English', subtitle: 'Native' }),
          entry({ title: 'Spanish', subtitle: 'Professional' }),
        ],
      },
    ],
  };
}
