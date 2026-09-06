# MedisinACSHS — Hospital/Medical Facility Lookup Policy

The structured hospital directory is the source of truth for supported locations.

Rules:
- A request such as "hospital near me" requires the user’s current general city/municipality when no location is already known.
- Never assume the kiosk/demo venue is the user’s location.
- Use an explicitly supplied location, or a location already established in the active hospital conversation.
- Return only facilities present in the approved structured directory.
- General city/municipality is sufficient; exact GPS coordinates are not required for this directory lookup.
- Do not calculate, invent, or display live/approximate distances.
- Do not claim that one facility is the closest unless a real distance capability is added later.
- An emergency request must retain its emergency guidance priority.
