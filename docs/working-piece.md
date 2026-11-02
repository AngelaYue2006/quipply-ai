# One working piece: matching a profile to a real job posting

Quipply is a local internship tracker. Its core feature is **Score match**: given my profile and one job's description, it decides whether I'm eligible, what I match, what I'm missing, and gives a 0–100 score.

The model has a narrow job. It only reads the posting and the profile and returns a checklist of requirements with quotes. Everything else is plain code:

1. **Eligibility (code, before the model):** rules for citizenship, clearance, sponsorship, degree, term and graduation window.
2. **Fit checklist (one model call):** the prompt below, with JSON output enforced by a schema.
3. **Quote check (code):** every quote the model gives must actually appear in the posting or the profile. Any item that fails is downgraded to "unclear", so invented evidence can't raise the score.
4. **Score and verdict (code):** required items weigh 3 and preferred items 1; yes = 1, partial = 0.5, no = 0; unclear items are left out. Verdict thresholds: strong ≥ 80, good ≥ 65, stretch ≥ 50.

## The run

- **Command:** `pnpm match:demo --profile profile.json --job job.json --description description.txt`
- **Model:** `gemini-3.8-flash` (Google Gemini API), structured JSON output
- **Usage:** 2,283 input tokens, 1,918 output tokens (including thinking), about $0.009, 64 s
- **Date:** November 1, 2026

## The prompt (`match-fit@1`, system instruction)

```text
You compare one job posting with one candidate profile and return a requirements
checklist as JSON. You do not score or rank; code does that.

Rules:
1. List each distinct qualification the posting asks for, at most 15. Merge
   duplicates. Skip benefits, company descriptions and application instructions.
2. kind = "required" if the posting says required, must, minimum or basic
   qualifications, or gives no qualifier. kind = "preferred" for preferred,
   nice to have, bonus or plus.
3. met:
   - "yes" only if the profile explicitly shows it. Close synonyms count
     (JS = JavaScript, Postgres = PostgreSQL); related but different things do
     not (React is not Vue, C is not C++).
   - "partial" if the profile shows part of it (one year when two are asked;
     coursework but no project).
   - "no" if the profile is specific enough to show it is missing.
   - "unclear" for soft skills or anything a profile cannot show.
4. jobQuote: copy the exact words from the posting. profileEvidence: copy the
   exact words from the profile, or null when met is "no" or "unclear".
5. Put citizenship, security clearance, sponsorship, graduation-date and
   location requirements in hardRequirements with an exact quote. Do not decide
   eligibility.
6. Never invent experience, skills or numbers. If the posting lists no real
   qualifications, return an empty requirements list.
7. summary: one or two plain sentences naming the biggest strength and the
   biggest gap.
Return only JSON matching the schema.
```

## The input (user message)

- **Job:** a real, live posting, [USAFacts: AI & Software Engineer Intern](https://job-boards.greenhouse.io/usafacts/jobs/4472154009) (Bellevue, WA). The app fetched its text from Greenhouse's public API (6,491 characters).
- **Profile:** a test persona from the project's fixtures, not a real person. Only the education, experience, project and skill sections are sent; work authorization and contact details never go to the model.

<details>
<summary>Full user message, exactly as sent</summary>

```text
<job title="AI &amp; Software Engineer Intern" company="USAFacts">The Organization

At USAFacts, we believe facts deserve to be heard. We turn data from thousands of jurisdictions into clear, unbiased answers about how government spends money and what it achieves. No political agenda. No commercial motive. Just public service.

Founded and funded by Steve Ballmer, former CEO of Microsoft, we work alongside Ballmer Group Philanthropy and Rainier Climate on civic impact.

As an intern, you’ll join a collaborative, mission-driven team and learn how complex public data becomes something the American people can actually use.

To top it off, Fast Company has recognized USAFacts four years running, including the 2026 Most Innovative Companies list. Learn more at usafacts.org and LinkedIn. Learn more about us at usafacts.org and linkedin.com/company/usafacts.

We’d love for you to bring your curiosity, and your conviction that facts matter, to your summer with us.

Your Internship with USAFacts

This is a paid, full-time internship for your penultimate year of undergraduate study, where you’ll do real work on real products. Here’s what to expect:

Pay

$38 per hour for at least 10 weeks, which comes to roughly $15,200 before taxes at 40 hours per week. Interns are overtime eligible, so hours over 40 per week are paid at time and a half.

Housing support

Relocating interns receive company-paid furnished corporate housing and a $1,000 travel reimbursement. Interns who live in the area and don’t need corporate housing can be reimbursed up to $2,000 per month for housing costs with a current rental agreement.

Paid sick days and holidays

3 paid sick days and paid holidays for the duration of your internship.

Hybrid schedule

In the office Tuesday through Thursday, with lunches provided, and the flexibility to work remotely or in-office the rest of the week.

Transportation

You’ll receive either an ORCA card for local public transit or paid parking in or near the building.

Events, community, and opportunities

At USAFacts, we believe a great internship is about more than just the work. Throughout the summer, you'll have opportunities to connect with your fellow interns, build relationships across the organization, and make the most of your time in the Seattle area. From organization-wide events and team outings to boat rides, paddleboarding adventures, and sushi dinners, you'll have plenty of opportunities to build connections and have fun along the way. Each intern cohort receives a dedicated morale budget to plan activities together and make the summer their own. You'll also have the unique opportunity to present your projects and accomplishments directly to USAFacts founder and former Microsoft CEO Steve Ballmer and other organizational leaders.

The Opportunity

As an AI & Software Engineering Intern at USAFacts, you’ll help build the data and software systems that turn complex government data into trusted insights used by millions of people. Working alongside experienced engineers and product managers, you’ll contribute to designing, building, and testing tools, pipelines, and product features that power USAFacts’ platforms.

You’ll gain hands-on experience across parts of the technology stack, from helping develop data pipelines that integrate and prepare large public datasets to contributing to software features that make data accessible and useful. You may also explore emerging AI capabilities, such as preparing datasets for machine learning or supporting AI-enabled features.

This internship is a chance to grow your technical skills, learn modern engineering practices, and work with a collaborative team dedicated to making reliable information about the country more accessible to everyone.

Key Priorities and Responsibilities

- Collaborate with engineers and product managers to design, build, test, and document software and data systems.

- Build mission-critical AI applications, data analysis tools, and end-to-end app development. Products you may contribute to include a Claude Connector, ChatGPT Plugin and MCP Server.

- Learn and apply modern development practices (version control, testing, debugging, evaluations platforms, CI/CD).

The Ideal Candidate

- Rising senior pursuing a bachelor’s degree in computer science, software engineering, data science, or a related field (this internship is for the summer before your final year of undergraduate study).

- Strong programming foundation (Python required; JavaScript/TypeScript a plus).

- Familiarity with databases and SQL.

- Interest in both software development and data systems.

- Curiosity about AI/ML and how data powers intelligent products.

- Comfort working across different layers of the stack, from data pipelines to product features.

Additional Information

The position is based in Bellevue, Washington. USAFacts practices intentional hybrid work​: all employees are on-site Tuesdays through Thursdays, with Mondays and Fridays flexible between home and office.

This is a non-exempt, hourly role paid at $38 per hour. Interns are not eligible for the company’s standard benefits package, but you will receive the paid time off, housing support, and transportation support described above. Start and end dates are flexible between May and September to fit your school schedule, for a minimum of 10 weeks. We’re not able to coordinate academic credit through your school.

Nonpartisan Commitment

USAFacts is a nonpartisan, not-for-profit organization dedicated to making government data accessible and understandable as a free public service. Consistent with our Political Activity Policy, and to preserve the trust and neutrality essential to our mission, all employees must refrain from political activity that could compromise our impartiality. This includes making political donations, volunteering for or publicly supporting political candidates, parties, or campaigns. Additionally, employees are expected to avoid expressing partisan views on public platforms where they are identifiable as affiliated with USAFacts. This policy helps ensure our work—and our organization—remains trusted, fact-based, and free from political influence.

USAFacts is an equal-opportunity employer and is dedicated to building an inclusive workforce where diversity is valued. Individuals seeking employment at USAFacts are considered without regard to race, color, religion, national origin, age, sex, martial status, ancestry, physical or mental disability, veteran status, gender identity, or sexual orientation.</job>
<profile>{
  "education": [
    {
      "school": "Example State University",
      "degreeType": "BS",
      "majors": [
        "Computer Science"
      ],
      "minors": [],
      "gpa": "3.70",
      "gpaScale": "4.0",
      "start": "2023-09",
      "graduation": "2027-05",
      "coursework": [
        "Data Structures",
        "Databases",
        "Machine Learning"
      ],
      "honors": []
    }
  ],
  "experience": [
    {
      "company": "Acme Widgets",
      "title": "Software Engineering Intern",
      "employmentType": "internship",
      "location": "",
      "start": "2025-06",
      "end": "2025-08",
      "current": false,
      "bullets": [
        "Built REST APIs in TypeScript and Node.js serving 2k requests per minute",
        "Wrote Python scripts to clean sensor data and load it into PostgreSQL"
      ],
      "skills": [
        "TypeScript",
        "Node.js",
        "Python",
        "PostgreSQL"
      ]
    }
  ],
  "projects": [
    {
      "name": "Tiny Compiler",
      "role": "",
      "start": "",
      "end": "",
      "bullets": [
        "Wrote a compiler for a toy language in Rust"
      ],
      "skills": [
        "Rust"
      ],
      "link": ""
    }
  ],
  "skills": {
    "languages": [
      {
        "name": "Python",
        "level": ""
      },
      {
        "name": "TypeScript",
        "level": ""
      },
      {
        "name": "JavaScript",
        "level": ""
      },
      {
        "name": "SQL",
        "level": ""
      }
    ],
    "frameworks": [
      {
        "name": "React",
        "level": ""
      },
      {
        "name": "pandas",
        "level": ""
      }
    ],
    "tools": [
      {
        "name": "Git",
        "level": ""
      },
      {
        "name": "Docker",
        "level": ""
      },
      {
        "name": "AWS",
        "level": ""
      }
    ],
    "domains": []
  }
}</profile>
```

</details>

## The model's output (raw JSON, unedited)

```json
{
  "requirements": [
    {
      "text": "Pursuing a bachelor's degree in computer science, software engineering, data science, or related field",
      "kind": "required",
      "category": "education",
      "met": "yes",
      "jobQuote": "pursuing a bachelor’s degree in computer science, software engineering, data science, or a related field",
      "profileEvidence": "BS in Computer Science"
    },
    {
      "text": "Strong programming foundation with Python",
      "kind": "required",
      "category": "skill",
      "met": "yes",
      "jobQuote": "Strong programming foundation (Python required",
      "profileEvidence": "Wrote Python scripts to clean sensor data and load it into PostgreSQL"
    },
    {
      "text": "Proficiency with JavaScript/TypeScript",
      "kind": "preferred",
      "category": "skill",
      "met": "yes",
      "jobQuote": "JavaScript/TypeScript a plus",
      "profileEvidence": "Built REST APIs in TypeScript and Node.js serving 2k requests per minute"
    },
    {
      "text": "Familiarity with databases and SQL",
      "kind": "required",
      "category": "skill",
      "met": "yes",
      "jobQuote": "Familiarity with databases and SQL.",
      "profileEvidence": "load it into PostgreSQL"
    },
    {
      "text": "Interest in both software development and data systems",
      "kind": "required",
      "category": "other",
      "met": "unclear",
      "jobQuote": "Interest in both software development and data systems.",
      "profileEvidence": null
    },
    {
      "text": "Curiosity about AI/ML and how data powers intelligent products",
      "kind": "required",
      "category": "other",
      "met": "unclear",
      "jobQuote": "Curiosity about AI/ML and how data powers intelligent products.",
      "profileEvidence": null
    },
    {
      "text": "Comfort working across different layers of the stack, from data pipelines to product features",
      "kind": "required",
      "category": "other",
      "met": "unclear",
      "jobQuote": "Comfort working across different layers of the stack, from data pipelines to product features.",
      "profileEvidence": null
    }
  ],
  "hardRequirements": [
    {
      "text": "Rising senior / penultimate year of undergraduate study",
      "jobQuote": "Rising senior pursuing a bachelor’s degree in computer science, software engineering, data science, or a related field (this internship is for the summer before your final year of undergraduate study)."
    },
    {
      "text": "Hybrid work on-site in Bellevue, Washington Tuesdays through Thursdays",
      "jobQuote": "The position is based in Bellevue, Washington. USAFacts practices intentional hybrid work​: all employees are on-site Tuesdays through Thursdays, with Mondays and Fridays flexible between home and office."
    }
  ],
  "summary": "The candidate strongly matches the technical stack, showing demonstrated practical experience with Python, TypeScript, and SQL databases. The primary gap is that soft skills and topical interests cannot be conclusively verified from resume bullet points alone."
}
```

## What the code did with it

```json
{
  "status": "scored",
  "score": 100,
  "verdict": "strong",
  "eligibility": {
    "eligible": true,
    "blockers": []
  },
  "strengths": [
    {
      "point": "Strong programming foundation with Python",
      "evidence": {
        "job": "Strong programming foundation (Python required",
        "profile": "Wrote Python scripts to clean sensor data and load it into PostgreSQL"
      }
    },
    {
      "point": "Proficiency with JavaScript/TypeScript",
      "evidence": {
        "job": "JavaScript/TypeScript a plus",
        "profile": "Built REST APIs in TypeScript and Node.js serving 2k requests per minute"
      }
    },
    {
      "point": "Familiarity with databases and SQL",
      "evidence": {
        "job": "Familiarity with databases and SQL.",
        "profile": "load it into PostgreSQL"
      }
    }
  ],
  "gaps": [],
  "skills": {
    "required": [
      {
        "skill": "Strong programming foundation with Python",
        "have": true
      },
      {
        "skill": "Familiarity with databases and SQL",
        "have": true
      }
    ],
    "preferred": [
      {
        "skill": "Proficiency with JavaScript/TypeScript",
        "have": true
      }
    ]
  },
  "summary": "The candidate strongly matches the technical stack, showing demonstrated practical experience with Python, TypeScript, and SQL databases. The primary gap is that soft skills and topical interests cannot be conclusively verified from resume bullet points alone.",
  "warnings": [
    "1 item(s) quoted text that isn't in the posting or your profile, so they were ignored.",
    "posting mentions a grad window requirement: \"Rising senior pursuing a bachelor’s degree in computer science, software engineering, data science, or a related field (this internship is for the summer before your final year of undergraduate study).\"",
    "posting mentions a location requirement: \"The position is based in Bellevue, Washington. USAFacts practices intentional hybrid work​: all employees are on-site Tuesdays through Thursdays, with Mondays and Fridays flexible between home and office.\""
  ]
}
```

How to read the result:

- **The quote check worked.** The model listed `"BS in Computer Science"` as evidence for the degree requirement. That exact phrase isn't in the profile, which stores `"BS"` and `"Computer Science"` as separate fields, so the code downgraded that item to "unclear" and added the warning *"1 item(s) quoted text that isn't in the posting or your profile."*
- **The score is code, not model opinion.** Three requirements passed the check, all met: two required (Python, SQL) and one preferred (TypeScript). That gives (3 + 3 + 1) / (3 + 3 + 1) = 100, so the verdict is "strong". Soft-skill items such as "curiosity about AI/ML" are "unclear" by design and don't count.
- **Hard requirements become warnings, not guesses.** The model found "rising senior" and an on-site requirement in Bellevue. The test persona graduates in May 2027, so this Summer 2027 role, which is for students in the summer before their final year, probably doesn't fit them. The app surfaces that as a warning instead of letting the model decide eligibility.

## What I learned from this piece

The same run with the cheaper `gemini-3.5-flash-lite` took 2 seconds instead of 64. But it cited several profile entries at once, for example `"Python, TypeScript, JavaScript"`, so the quote check rejected 5 of its 6 items and the score rested on a single requirement. On my own scored jobs, this showed up as scores that were always either 0 or 100.

The quote check made the failure visible instead of hiding it, but it was too strict about format. I changed it (matcher version `rubric@2`):
- **Lists now pass** when every entry is an exact profile entry, matched as whole words.
- **Phrases joined by "at" or "in"** ("BS in Computer Science", "Intern at Acme Widgets") must come from the same profile entry, so details from different jobs can't be stitched together.
- **Paraphrases and invented entries still fail.**
- **Every score now shows its basis**, for example "Based on 4 of 6 requirements", so a thin score is obvious.

I replayed the saved model outputs through the new check, with no new model calls. Flash-Lite on this posting now rests on 4 of 6 requirements instead of 1, and the two still rejected are genuine paraphrases. The 3.8 Flash output shown above now passes with no rejections, because "BS in Computer Science" is accepted.
