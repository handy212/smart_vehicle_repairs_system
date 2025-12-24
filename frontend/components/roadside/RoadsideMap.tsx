"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for leaflet markers not showing up in Next.js
const icon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

interface RoadsideMapProps {
    latitude: number;
    longitude: number;
    address?: string;
}

function ChangeView({ center }: { center: [number, number] }) {
    const map = useMap();
    map.setView(center, map.getZoom());
    return null;
}

export default function RoadsideMap({ latitude, longitude, address }: RoadsideMapProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="h-[300px] w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse flex items-center justify-center text-muted-foreground">Loading Map...</div>;

    const position: [number, number] = [latitude, longitude];

    return (
        <div className="h-[300px] w-full rounded-xl overflow-hidden shadow-inner border dark:border-gray-700 relative z-0">
            <MapContainer
                center={position}
                zoom={15}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={position} icon={icon}>
                    <Popup>
                        <div className="text-xs">
                            <p className="font-bold">Breakdown Location</p>
                            <p className="mt-1">{address || "Coordinates recorded"}</p>
                        </div>
                    </Popup>
                </Marker>
                <ChangeView center={position} />
            </MapContainer>
        </div>
    );
}
