# Contributing to Iji

## What is Iji?

Iji is the household's AI Chief of Staff — a single brain that coordinates schedules, manages home operations, tracks finances, handles communications, and keeps everyone informed. It's named after the wise giant war counselor from Elden Ring: dependable, calm, always ready to help.

Iji runs on a cloud server, talks to people over Signal, and uses Claude (Anthropic's AI) as its brain. When someone messages Iji, it figures out what they need, uses tools to look things up or take action (check the calendar, query the weather, set a reminder), and responds naturally.

The long-term vision: Iji manages everything a Butler and Housekeeper would in a well-run household. Schedules, logistics, meals, maintenance, inventory, finances, kids' activities, guest coordination — the full scope of keeping a large family running so no one person carries it all in their head.

## What's built today

Iji can currently:
- **Answer questions and remember things** — household knowledge base that persists across conversations
- **Manage calendars** — view, create, and modify events for household members; check who's free when
- **Set reminders** — time-based reminders with follow-up nudges until you confirm you've done the thing
- **Deliver morning briefings** — daily 9am Signal DM with your calendar, weather, reminders, and recent household knowledge
- **Check weather** — current conditions and forecast for Berkeley (or anywhere)
- **Query finances** — transaction search and cost tracking through Monarch Money
- **Search and read email** — Gmail integration (Lee only, currently)
- **Control the house** — lights, thermostat, and other Home Assistant devices via voice/text
- **Send messages** — relay messages to other household members or groups via Signal

See `BACKLOG.md` for the full capability map with status indicators showing what's verified, what's broken, and what's not built yet.

## What's not built yet (and where you come in)

The backlog has 14 departments worth of capabilities. Some highlights that need a Product owner:

- **Calendar intelligence** — conflict detection, multi-person scheduling negotiation, "who's picking up kids" problem
- **Children** — AM/PM routines, school schedules, activity tracking, permission slips
- **Meals & Kitchen** — recipe memory, weekly menus, chef coordination
- **Procurement** — grocery lists, Safeway integration, delivery tracking
- **Entertaining & Hospitality** — guest management, event planning

Each of these needs someone who lives the problem to define what Iji should do. That's the Product role.

## How we build things

Every change to Iji follows a cycle with three roles:

| Role | Who | Does |
|------|-----|------|
| **Product** | You (+ Lee as CTO) | Decides what to build, defines the problem, acceptance-tests in the real world |
| **Engineer** | Claude (in chat) | Turns your problem into a spec, writes decision records, manages the backlog |
| **Dev** | Cursor (AI coding tool) | Implements the spec, commits code, pushes to the repo |

### The cycle

1. **You describe the problem.** Not a solution — the problem. "I never know if two adults are both supposedly picking up kids at the same time" is a great starting point. "Build a calendar diff tool" is not (that's a solution).

2. **Engineer writes a spec.** In your Claude chat, the Engineer turns your problem into a concrete spec: what Iji should do, how it should behave, what the interface looks like. The spec goes into the `specs/` folder in the repo.

3. **Engineer writes a Cursor prompt.** A short document that tells Cursor (the coding AI) what to build and which files to read. Cursor doesn't need hand-holding on how to code — it needs to know *what* to code and *where the patterns are*.

4. **You give the Cursor prompt to Cursor.** Cursor implements, commits, and pushes to a feature branch.

5. **Lee and Engineer review.** Before anything goes live, Lee and the Engineer review the change. Once approved, it merges to main and deploys automatically.

6. **You test for real.** Send Iji a message that exercises the new capability. Does it work? Does it feel right? Your feedback closes the loop.

### Key principle

**Chat is disposable, the repo is the record.** Specs, decisions, and backlog updates go into the repo. Your Claude conversation is just a workspace — if it disappeared tomorrow, everything important would still be in the project files.

## Your first session

### Setup

You need:
- **GitHub access** to the `household-agent` repo (ask Lee)
- **The repo cloned** on your computer (Lee can help with this)
- **A Claude chat** where you'll work with the Engineer

### Starting a session

Open a new Claude conversation and paste the starter prompt (Lee will provide this). It tells Claude:
- Who you are and your role
- What project you're working on
- Where the repo lives on your filesystem
- What domain you own

Then just... talk about problems. "Here's what's annoying about our calendar situation." "I wish Iji could tell me when there's a conflict." "What would it take to have Iji manage school pickup logistics?" The Engineer will ask clarifying questions, look at the existing code and backlog, and start shaping specs.

### What you don't need to know

- Node.js, JavaScript, or any programming language
- How the server works, how CI/CD works, how Signal works
- How to deploy anything

The Engineer handles all technical translation. Your job is to know what the household needs and to test whether Iji delivers it.

## Repo structure (the parts you'll care about)

```
ARCHITECTURE.md        — System design and vision (read once for context)
BACKLOG.md             — What's built, what's broken, what's planned
DEV-PROTOCOL.md        — The full build process (reference when needed)
specs/                 — Feature specs (you'll help create these)
docs/decisions/        — Decision records (why we chose X over Y)
config/household.json  — Family member config (permissions, calendar IDs, etc.)
```

You don't need to look at `src/` unless you're curious. That's Cursor's territory.
