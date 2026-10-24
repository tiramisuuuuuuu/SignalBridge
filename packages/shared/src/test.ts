import { EmergencyPacket } from "./schema";
import { samplePacket } from "./samplePacket";

console.log("valid:", EmergencyPacket.safeParse(samplePacket).success);
console.log("invalid:", EmergencyPacket.safeParse({ version: "oops" }).success);
