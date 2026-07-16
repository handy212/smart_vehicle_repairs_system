"use client";

import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PremiumIcons } from "@/components/ui/icons";
import { getCustomerDisplayName } from "@/lib/utils/customer-display";
import { Car, Hash, Mail, Phone, Plus, Tag } from "lucide-react";

export type SelectedCustomerSummary = {
  id: number;
  full_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  customer_type?: string;
  customer_number?: string;
};

export type VehicleListItem = {
  id: number;
  make: string;
  model: string;
  year: number;
  vin: string;
  license_plate?: string;
};

export type BusinessContactOption = {
  id: number;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  job_title?: string;
};

export type FieldErrorMessage = {
  message?: string;
};

export interface NewWorkOrderCustomerSectionProps {
  customerId?: number;
  customerError?: FieldErrorMessage;
  onCustomerSelect: (customer: SelectedCustomerSummary) => void;
  onAddCustomerClick: () => void;
  selectedCustomerData: SelectedCustomerSummary | null;
  selectedCustomerId: number | null;
  vehicleId?: number;
  vehicleError?: FieldErrorMessage;
  onVehicleChange: (vehicleId: number) => void;
  vehicles: VehicleListItem[];
  selectedVehicle: VehicleListItem | null;
  onAddVehicleClick: () => void;
  isBusinessAccount: boolean;
  businessUseManualContact: boolean;
  onBusinessUseManualContactChange: (checked: boolean) => void;
  individualUseThirdParty: boolean;
  onIndividualUseThirdPartyChange: (checked: boolean) => void;
  availableContacts: BusinessContactOption[];
  broughtByContactId?: number;
  onBroughtByContactSelect: (contactId: number, contact: BusinessContactOption | undefined) => void;
  selectedBusinessContact: BusinessContactOption | null;
  broughtByContactError?: FieldErrorMessage;
  broughtByName: string;
  onBroughtByNameChange: (value: string) => void;
  broughtByNameError?: FieldErrorMessage;
  broughtByPhone: string;
  onBroughtByPhoneChange: (value: string) => void;
  broughtByEmail: string;
  onBroughtByEmailChange: (value: string) => void;
  broughtByRelationship: string;
  onBroughtByRelationshipChange: (value: string) => void;
}

export function NewWorkOrderCustomerSection({
  customerId,
  customerError,
  onCustomerSelect,
  onAddCustomerClick,
  selectedCustomerData,
  selectedCustomerId,
  vehicleId,
  vehicleError,
  onVehicleChange,
  vehicles,
  selectedVehicle,
  onAddVehicleClick,
  isBusinessAccount,
  businessUseManualContact,
  onBusinessUseManualContactChange,
  individualUseThirdParty,
  onIndividualUseThirdPartyChange,
  availableContacts,
  broughtByContactId,
  onBroughtByContactSelect,
  selectedBusinessContact,
  broughtByContactError,
  broughtByName,
  onBroughtByNameChange,
  broughtByNameError,
  broughtByPhone,
  onBroughtByPhoneChange,
  broughtByEmail,
  onBroughtByEmailChange,
  broughtByRelationship,
  onBroughtByRelationshipChange,
}: NewWorkOrderCustomerSectionProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-muted/30 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <PremiumIcons.Users className="h-5 w-5 text-primary/80" />
          Customer / Business & Vehicle
        </CardTitle>
        <CardDescription>Select the customer or business account and vehicle</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label
                htmlFor="customer"
                className="block text-sm font-medium text-card-foreground mb-1"
              >
                Customer / Business *
              </label>

              <div className="flex gap-2">
                <div className={`flex-1 min-w-0 ${customerError ? "[&_button]:border-destructive" : ""}`}>
                  <CustomerSelector
                    selectedCustomerId={customerId}
                    placeholder="Search by company, contact, phone, or customer number..."
                    onSelect={(cust) => onCustomerSelect(cust)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  title="Add new customer"
                  onClick={onAddCustomerClick}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {customerError?.message && (
                <p className="mt-1 text-sm text-destructive dark:text-destructive">
                  {customerError.message}
                </p>
              )}
            </div>

            {selectedCustomerData && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {getCustomerDisplayName(selectedCustomerData)}
                </span>
                {selectedCustomerData.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedCustomerData.phone}
                  </span>
                )}
                {selectedCustomerData.email && (
                  <span
                    className="inline-flex max-w-[200px] items-center gap-1 truncate"
                    title={selectedCustomerData.email}
                  >
                    <Mail className="h-3 w-3 shrink-0" />
                    {selectedCustomerData.email}
                  </span>
                )}
                {selectedCustomerData.customer_type && (
                  <span className="inline-flex items-center gap-1 capitalize">
                    <Tag className="h-3 w-3" />
                    {selectedCustomerData.customer_type.replace("_", " ")}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="vehicle"
                className="block text-sm font-medium text-card-foreground mb-1"
              >
                Vehicle *
              </label>

              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <Select
                    value={vehicleId?.toString() || ""}
                    onValueChange={(val) => onVehicleChange(parseInt(val))}
                    disabled={!selectedCustomerId}
                  >
                    <SelectTrigger id="vehicle" className={`w-full ${vehicleError ? "border-destructive" : ""}`}>
                      <SelectValue
                        placeholder={
                          !selectedCustomerId
                            ? "Select a customer or business first"
                            : !vehicles.length
                              ? "No vehicles — add one with +"
                              : "Select a vehicle"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id.toString()}>
                          {v.make} {v.model} {v.year} — {v.vin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  title="Add new vehicle"
                  disabled={!selectedCustomerId}
                  onClick={onAddVehicleClick}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {vehicleError?.message && (
                <p className="mt-1 text-sm text-destructive dark:text-destructive">
                  {vehicleError.message}
                </p>
              )}
            </div>

            {selectedVehicle && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Car className="h-3 w-3" />
                  {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}
                </span>
                {selectedVehicle.license_plate && (
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {selectedVehicle.license_plate}
                  </span>
                )}
                {selectedVehicle.vin && (
                  <span>
                    VIN: <span className="font-mono">{selectedVehicle.vin}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedCustomerData && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Delivered By</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Record the individual who delivered the vehicle for this work order.
              </p>
            </div>

            {isBusinessAccount ? (
              <div className="space-y-4">
                <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={businessUseManualContact}
                    onChange={(e) => onBusinessUseManualContactChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Not in saved business contacts</p>
                  </div>
                </label>

                {!businessUseManualContact ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-card-foreground">
                      Business contact *
                    </label>
                    <Select
                      value={broughtByContactId?.toString() || ""}
                      onValueChange={(val) => {
                        const selectedId = parseInt(val);
                        const contact = availableContacts.find((item) => item.id === selectedId);
                        onBroughtByContactSelect(selectedId, contact);
                      }}
                    >
                      <SelectTrigger className={broughtByContactError ? "border-destructive" : ""}>
                        <SelectValue
                          placeholder={
                            availableContacts.length ? "Select contact person" : "No saved contacts found"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableContacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id.toString()}>
                            {contact.first_name} {contact.last_name}
                            {contact.job_title ? ` — ${contact.job_title}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {broughtByContactError?.message && (
                      <p className="text-sm text-destructive">{broughtByContactError.message}</p>
                    )}
                    {selectedBusinessContact && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {selectedBusinessContact.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {selectedBusinessContact.phone}
                          </span>
                        )}
                        {selectedBusinessContact.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {selectedBusinessContact.email}
                          </span>
                        )}
                        {selectedBusinessContact.job_title && (
                          <span>Role: {selectedBusinessContact.job_title}</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Person name *
                      </label>
                      <Input
                        value={broughtByName}
                        onChange={(e) => onBroughtByNameChange(e.target.value)}
                        placeholder="Enter full name"
                      />
                      {broughtByNameError?.message && (
                        <p className="mt-1 text-sm text-destructive">{broughtByNameError.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Relationship / role
                      </label>
                      <Input
                        value={broughtByRelationship}
                        onChange={(e) => onBroughtByRelationshipChange(e.target.value)}
                        placeholder="Driver, staff, representative..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Phone
                      </label>
                      <Input
                        value={broughtByPhone}
                        onChange={(e) => onBroughtByPhoneChange(e.target.value)}
                        placeholder="Phone number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Email
                      </label>
                      <Input
                        value={broughtByEmail}
                        onChange={(e) => onBroughtByEmailChange(e.target.value)}
                        type="email"
                        placeholder="Email address"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={individualUseThirdParty}
                    onChange={(e) => onIndividualUseThirdPartyChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">Brought by driver or another person</p>
                    <p className="text-xs text-muted-foreground">
                      Turn this on if someone other than the customer/account holder brought the vehicle.
                    </p>
                  </div>
                </label>

                {individualUseThirdParty && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Person name *
                      </label>
                      <Input
                        value={broughtByName}
                        onChange={(e) => onBroughtByNameChange(e.target.value)}
                        placeholder="Enter full name"
                      />
                      {broughtByNameError?.message && (
                        <p className="mt-1 text-sm text-destructive">{broughtByNameError.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Relationship
                      </label>
                      <Input
                        value={broughtByRelationship}
                        onChange={(e) => onBroughtByRelationshipChange(e.target.value)}
                        placeholder="Driver, spouse, staff, friend..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Phone
                      </label>
                      <Input
                        value={broughtByPhone}
                        onChange={(e) => onBroughtByPhoneChange(e.target.value)}
                        placeholder="Phone number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-card-foreground mb-1">
                        Email
                      </label>
                      <Input
                        value={broughtByEmail}
                        onChange={(e) => onBroughtByEmailChange(e.target.value)}
                        type="email"
                        placeholder="Email address"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
