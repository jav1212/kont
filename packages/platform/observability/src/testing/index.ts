import type { Incident, IncidentRecorder } from "../application/index";

/** In-memory recorder retaining incidents for deterministic assertions. */
export class RecordingIncidentRecorder implements IncidentRecorder {
  readonly incidents: Incident[] = [];

  /** {@inheritDoc IncidentRecorder.record} */
  async record(incident: Incident): Promise<void> {
    this.incidents.push(incident);
  }
}

/** Recorder that deterministically simulates unavailable incident storage. */
export class FailingIncidentRecorder implements IncidentRecorder {
  /**
   * Creates a recorder that rejects every persistence attempt.
   * @param failure - Failure instance thrown for each attempt.
   */
  constructor(private readonly failure: Error = new Error("Incident storage is unavailable.")) {}

  /** {@inheritDoc IncidentRecorder.record} */
  async record(_incident: Incident): Promise<void> {
    throw this.failure;
  }
}
