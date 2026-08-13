import type { Incident, IncidentRecorder } from "@kontave/observability-application";

export class RecordingIncidentRecorder implements IncidentRecorder {
  readonly incidents: Incident[] = [];

  async record(incident: Incident): Promise<void> {
    this.incidents.push(incident);
  }
}

export class FailingIncidentRecorder implements IncidentRecorder {
  constructor(private readonly failure: Error = new Error("Incident storage is unavailable.")) {}

  async record(_incident: Incident): Promise<void> {
    throw this.failure;
  }
}
