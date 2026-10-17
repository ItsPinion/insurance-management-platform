CREATE TYPE "public"."ClaimStatus" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."DocumentType" AS ENUM('IDENTITY', 'POLICY', 'CLAIM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."PaymentStatus" AS ENUM('PAID', 'PENDING', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."PolicyStatus" AS ENUM('ACTIVE', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."PolicyType" AS ENUM('HEALTH', 'LIFE', 'VEHICLE', 'HOME', 'TRAVEL');--> statement-breakpoint
CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'AGENT', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "Claim" (
	"id" serial PRIMARY KEY NOT NULL,
	"claimNumber" text NOT NULL,
	"claimAmount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "ClaimStatus" DEFAULT 'SUBMITTED' NOT NULL,
	"submissionDate" timestamp (3) DEFAULT now() NOT NULL,
	"reviewRemarks" text,
	"reviewedAt" timestamp (3),
	"policyId" integer NOT NULL,
	"reviewerId" integer
);
--> statement-breakpoint
CREATE TABLE "Customer" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dob" timestamp (3) NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"email" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"userId" integer
);
--> statement-breakpoint
CREATE TABLE "Document" (
	"id" serial PRIMARY KEY NOT NULL,
	"fileName" text NOT NULL,
	"filePath" text NOT NULL,
	"mimeType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"docType" "DocumentType" DEFAULT 'OTHER' NOT NULL,
	"uploadedAt" timestamp (3) DEFAULT now() NOT NULL,
	"customerId" integer NOT NULL,
	"claimId" integer
);
--> statement-breakpoint
CREATE TABLE "Policy" (
	"id" serial PRIMARY KEY NOT NULL,
	"policyNumber" text NOT NULL,
	"policyType" "PolicyType" NOT NULL,
	"premiumAmount" numeric(12, 2) NOT NULL,
	"startDate" timestamp (3) NOT NULL,
	"endDate" timestamp (3) NOT NULL,
	"status" "PolicyStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"customerId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PremiumPayment" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"dueDate" timestamp (3) NOT NULL,
	"paymentDate" timestamp (3),
	"paymentStatus" "PaymentStatus" DEFAULT 'PENDING' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"policyId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "Role" DEFAULT 'CUSTOMER' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."Policy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "public"."Claim"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PremiumPayment" ADD CONSTRAINT "PremiumPayment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."Policy"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Claim_claimNumber_key" ON "Claim" USING btree ("claimNumber");--> statement-breakpoint
CREATE INDEX "Claim_policyId_idx" ON "Claim" USING btree ("policyId");--> statement-breakpoint
CREATE INDEX "Claim_status_idx" ON "Claim" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Customer_name_idx" ON "Customer" USING btree ("name");--> statement-breakpoint
CREATE INDEX "Customer_phone_idx" ON "Customer" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "Document_customerId_idx" ON "Document" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "Document_claimId_idx" ON "Document" USING btree ("claimId");--> statement-breakpoint
CREATE UNIQUE INDEX "Policy_policyNumber_key" ON "Policy" USING btree ("policyNumber");--> statement-breakpoint
CREATE INDEX "Policy_customerId_idx" ON "Policy" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "Policy_status_idx" ON "Policy" USING btree ("status");--> statement-breakpoint
CREATE INDEX "Policy_endDate_idx" ON "Policy" USING btree ("endDate");--> statement-breakpoint
CREATE INDEX "PremiumPayment_policyId_idx" ON "PremiumPayment" USING btree ("policyId");--> statement-breakpoint
CREATE INDEX "PremiumPayment_paymentStatus_idx" ON "PremiumPayment" USING btree ("paymentStatus");--> statement-breakpoint
CREATE INDEX "PremiumPayment_dueDate_idx" ON "PremiumPayment" USING btree ("dueDate");--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" USING btree ("email");--> statement-breakpoint
CREATE INDEX "User_role_idx" ON "User" USING btree ("role");