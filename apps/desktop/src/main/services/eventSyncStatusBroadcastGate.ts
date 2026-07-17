class EventSyncStatusBroadcastGate {
  private _enabled = true;

  public get isEnabled(): boolean {
    return this._enabled;
  }

  public disable(): void {
    this._enabled = false;
  }
}

const rendererEventSyncStatusBroadcastGate = new EventSyncStatusBroadcastGate();

export { EventSyncStatusBroadcastGate, rendererEventSyncStatusBroadcastGate };
