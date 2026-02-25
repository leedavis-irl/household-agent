# Initial Launch Lessons

The two bugs from our first production session:

**Bug 1: Wave 2 tools deployed but unconfigured**
- Spec had no server requirements checklist -> code shipped without env vars
- Server confirmation step was never run -> nobody noticed for weeks
- **Vaccination:** Server requirements checklist is now mandatory in every spec

**Bug 2: Signal DM replies fail with null recipient**
- No verification checklist existed -> "send a DM and check logs" was never written down
- No post-mortem process -> the lesson would have been lost
- **Vaccination:** Signal verification checklist now includes DM + group reply tests
