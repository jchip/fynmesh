import React, { useEffect, useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import { Panel } from "fynops-ui-kit";
import {
  fynopsData,
  TOPIC_VEHICLE_POSITIONS,
  type ShipmentDetail,
  type VehiclePositionsTick,
} from "fynops-data-core";
import { StatusBadge, delayHours, formatDate, formatDelay, formatNumber, formatUsd } from "./status";

type Vehicle = NonNullable<ShipmentDetail["vehicle"]>;

/** The drawer face of ops-shipments: one shipment, with its vehicle's live position. */
export const ShipmentDetailPanel: React.FC<{ id: number; runtime: FynUnitRuntime }> = ({ id, runtime }) => {
  const [detail, setDetail] = useState<ShipmentDetail | null | undefined>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    setDetail(undefined);
    fynopsData.shipments.get(id).then(
      (d) => {
        if (!live) return;
        setDetail(d);
        setVehicle(d?.vehicle ?? null);
      },
      (err: Error) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, [id]);

  // Follow the vehicle on the simulator's position stream.
  const vehicleId = detail?.vehicle?.id;
  useEffect(() => {
    if (vehicleId === undefined || !runtime.bus) return;
    return runtime.bus.on<VehiclePositionsTick>(TOPIC_VEHICLE_POSITIONS, (tick) => {
      const p = tick.vehicles.find((v) => v.id === vehicleId);
      if (p) setVehicle((prev) => prev && { ...prev, lat: p.lat, lon: p.lon, status: p.status, shipment_id: p.shipment_id });
    });
  }, [vehicleId, runtime]);

  if (error) return <Panel title="Shipment">Could not load shipment {id}: {error}</Panel>;
  if (detail === undefined) return <Panel title="Shipment">Loading shipment {id}...</Panel>;
  if (detail === null) return <Panel title="Shipment">No shipment with id {id}.</Panel>;

  const timeline = [
    { label: "Picked up", at: detail.pickup_at },
    { label: "Due", at: detail.due_at },
    ...(detail.delivered_at ? [{ label: "Delivered", at: detail.delivered_at }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const carryingOther = vehicle && vehicle.shipment_id !== null && vehicle.shipment_id !== detail.id;

  return (
    <div className="ops-sh-detail" data-testid="ops-sh-detail">
      <Panel title={detail.ref} actions={<StatusBadge status={detail.status} />}>
        <dl>
          <dt>Lane</dt>
          <dd>
            {detail.origin_info.code} {detail.origin_info.city}, {detail.origin_info.state} to{" "}
            {detail.destination_info.code} {detail.destination_info.city}, {detail.destination_info.state} (
            {formatNumber(detail.miles)} mi)
          </dd>
          <dt>Carrier</dt>
          <dd>
            {detail.carrier} ({detail.carrier_dot})
          </dd>
          <dt>Load</dt>
          <dd>
            {formatNumber(detail.weight_lbs)} lbs, {detail.pieces} pieces
          </dd>
          <dt>Rate</dt>
          <dd>{formatUsd(detail.rate_usd)}</dd>
          <dt>Delay</dt>
          <dd>{formatDelay(delayHours(detail), detail.status) || "not delivered yet"}</dd>
        </dl>
      </Panel>
      <Panel title="Vehicle">
        {vehicle ? (
          <dl data-testid="ops-sh-vehicle">
            <dt>Plate</dt>
            <dd>{vehicle.plate}</dd>
            <dt>Status</dt>
            <dd>{vehicle.status}</dd>
            <dt>Position</dt>
            <dd data-testid="ops-sh-vehicle-pos">
              {vehicle.lat.toFixed(4)}, {vehicle.lon.toFixed(4)}
            </dd>
            {carryingOther && (
              <>
                <dt>Now carrying</dt>
                <dd>shipment {vehicle.shipment_id}, so it may be on another lane</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="ops-sh-note">No vehicle assigned.</p>
        )}
      </Panel>
      <Panel title="Timeline">
        <ul className="ops-sh-timeline">
          {timeline.map((t) => (
            <li key={t.label}>
              <time dateTime={t.at}>{formatDate(t.at)}</time>
              <span>{t.label}</span>
            </li>
          ))}
          {!detail.delivered_at && (
            <li>
              <time />
              <span className="ops-sh-note">Not delivered yet</span>
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
};
