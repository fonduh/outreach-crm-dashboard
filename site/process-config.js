window.CRM_PUBLISHED_PROCESS = {
  "schemaVersion": 2,
  "source": "flowchart LR\n    INTERESTED[\"Interested · {{INTERESTED}}\"] --> APPLIED[\"Applied / recruiting · {{APPLIED}}\"]\n    APPLIED --> SCREEN[\"Screen · {{SCREEN}}\"]\n    SCREEN --> TASK[\"Take Home · {{TASK}}\"]\n    TASK --> INTERVIEW[\"Interview · {{INTERVIEW}}\"]\n    INTERVIEW --> OFFER[\"Offer · {{OFFER}}\"]\n    APPLIED --> CLOSED[\"Rejected · {{CLOSED}}\"]",
  "draft": "flowchart LR\n    INTERESTED[\"Interested · {{INTERESTED}}\"] --> APPLIED[\"Applied / recruiting · {{APPLIED}}\"]\n    APPLIED --> SCREEN[\"Screen · {{SCREEN}}\"]\n    SCREEN --> TASK[\"Take Home · {{TASK}}\"]\n    TASK --> INTERVIEW[\"Interview · {{INTERVIEW}}\"]\n    INTERVIEW --> OFFER[\"Offer · {{OFFER}}\"]\n    APPLIED --> CLOSED[\"Rejected · {{CLOSED}}\"]",
  "bindings": {
    "READY": [
      "not_started"
    ],
    "APPLIED": [
      "applied"
    ],
    "SCREEN": [
      "recruiter_screen"
    ],
    "TASK": [
      "take_home"
    ],
    "INTERVIEW": [
      "interview",
      "onsite"
    ],
    "OFFER": [
      "offer"
    ],
    "CLOSED": [
      "rejected",
      "withdrawn"
    ]
  },
  "processRevision": 1
};
