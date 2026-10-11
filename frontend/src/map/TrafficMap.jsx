import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

const DENSITY_COLORS = {
  LOW: "#16a34a",
  MEDIUM: "#ea8c1e",
  HIGH: "#c2410c",
  CRITICAL: "#dc2626",
};

export default function TrafficMap({ junctions, emergencyJunctionIds = new Set() }) {
  if (!junctions || junctions.length === 0) {
    return <div className="empty-state">No junctions to display. Add a junction to see it on the map.</div>;
  }

  const center = [junctions[0].latitude, junctions[0].longitude];

  return (
    <div className="map-container">
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {junctions.map((j) => {
          const isEmergency = emergencyJunctionIds.has(j.id);
          const color = isEmergency ? "#dc2626" : DENSITY_COLORS[j.current_density] || "#6b7280";
          return (
            <CircleMarker
              key={j.id}
              center={[j.latitude, j.longitude]}
              radius={isEmergency ? 12 : 9}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 2 }}
            >
              <Popup>
                <strong>{j.name}</strong>
                <br />
                Density: {j.current_density}
                <br />
                Vehicles: {j.current_vehicle_count}
                {isEmergency && (
                  <>
                    <br />
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>Emergency priority active</span>
                  </>
                )}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
