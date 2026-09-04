# MASTER PROMPT — BUILD “3D PRINTING BENCH”

Create a professional, browser-based web application called **3D Printing Bench**.

The application is intended for people and companies who design, quote, manufacture, and sell 3D-printed parts. It must be extremely simple for an ordinary user to operate, while having a detailed, engineering-grade calculation engine underneath.

The fundamental design principle is:

> **Simple on the surface, detailed and adjustable underneath.**

Do not make the user understand every calculation in order to get a useful result. At the same time, every important assumption, factor, cost, and formula must be inspectable and adjustable in an Advanced Settings area.

The application must work as a serious costing, quoting, production, project-management, inventory, and invoicing system rather than merely being a filament calculator.

---

# 1. CORE CONCEPT

The application must distinguish clearly between:

1. **Physical/production cost**
2. **Cost to Company (CTC)**
3. **Selling price of the part**
4. **Order extras**
5. **Final invoice amount**

Do NOT combine these concepts.

The fundamental pricing model is based on a **rule of thirds**.

For the part itself:

- approximately **1/3 = Cost to Company**
- approximately **1/3 = Labour + Growth**
- approximately **1/3 = Profit + Capital Recovery**

Therefore, under the normal pricing model:

> **Part Selling Price = CTC × 3**

Shipping, packaging selected as an order service, express delivery, and similar customer-facing extras are **outside this thirds calculation**.

For example:

If the calculated CTC of a part is R10:

- CTC = R10
- Labour + Growth = R10
- Profit + Capital = R10
- Part selling price = R30
- Shipping = +R90
- Customer total = R120

The R90 shipping does NOT become part of the R10 CTC and does NOT participate in the thirds calculation.

---

# 2. USER EXPERIENCE

The default interface should be simple.

A normal user should be able to:

1. Create a project
2. Add/upload a 3D model
3. Select a print intent
4. Select a printer
5. Select material
6. Enter quantity
7. Select delivery/shipping
8. Receive a cost and quote
9. Save the project
10. Generate a quote/invoice

The application should progressively reveal complexity.

Use:

- Simple Mode
- Advanced Mode
- Expert/Admin Settings

Simple Mode should show only the decisions a normal customer or operator needs to make.

Advanced Mode should expose the underlying calculations.

Expert/Admin Settings should allow the company to change formulas, percentages, pricing rules, databases, tariffs, labour rates, machine costs, and other assumptions.

---

# 3. PROJECT SYSTEM

Projects must be persistent and reopenable.

Each project should contain:

- Project name
- Customer
- Project number
- Date created
- Last modified
- Status
- Parts
- Quantities
- Printer
- Material
- Print intent
- Estimated print time
- Actual print time
- Material usage
- Cost
- Selling price
- Shipping
- Packaging
- Profit
- Quote history
- Production history
- Files
- Notes
- Version/history

Allow:

- New project
- Save project
- Duplicate project
- Archive project
- Reopen project
- Export project
- Import project

The system must preserve the exact calculation assumptions used when a quote was created.

If company settings later change, old quotes must not silently change.

---

# 4. PART MANAGEMENT

A project can contain multiple parts.

Each part should have:

- Part name
- Part number
- Revision
- Quantity
- 3D model
- Print intent
- Printer
- Material
- Colour
- Layer height
- Infill
- Wall count
- Support settings
- Orientation
- Estimated material
- Estimated print time
- Machine
- Labour
- Hardware
- Packaging
- Cost
- Price
- Profit
- Actual production statistics

Each part should have historical statistics.

Show:

- Estimated vs actual time
- Estimated vs actual material
- Estimated vs actual cost
- Number printed
- Number accepted
- Number rejected
- Scrap
- Cost per accepted part
- Profit per accepted part
- Printer used
- Material used
- Historical print performance

---

# 5. CUSTOMER SELF-QUOTING

Provide an optional customer-facing quoting system.

A company should be able to give customers a link where they can:

- Upload a 3D model
- Select quantity
- Select print intent
- Select material
- Select colour
- Select delivery
- Receive a quote

Customers must NOT see internal company calculations unless explicitly enabled.

The company should be able to configure:

- Which options customers can change
- Which printers are visible
- Which materials are available
- Minimum order values
- Quantity discounts
- Shipping
- Lead time
- Express options

Customer-facing pricing should use the same central calculation engine as internal quoting.

---

# 6. 3D MODEL ANALYSIS

Where technically possible, analyse uploaded 3D models.

Extract:

- Bounding box
- Volume
- Surface area
- Dimensions
- Estimated material
- Orientation
- Number of objects
- Potential support requirement
- Build-volume compatibility

The system should not pretend that geometric calculations alone equal a slicer result.

Use a clear hierarchy:

1. Actual slicer result
2. Imported slicer estimate
3. Calibrated application estimate
4. Geometric approximation

Always indicate which level is being used.

---

# 7. PRINT INTENT PROFILES

Create six default Print Intent Profiles.

## Extra Strong

- Infill: 95%
- Infill pattern: Gyroid
- Wall loops: 7
- Material: PLA CF
- Colour: Dark Grey
- Shrinkage compensation: No
- Angle/orientation optimisation: Yes
- Ironing: No
- Fuzzy skin: No
- Layer height: 0.20 mm

## Strength

- Infill: 80%
- Infill pattern: Gyroid
- Wall loops: 5
- Material: PLA
- Colour: Dark Grey
- Shrinkage compensation: No
- Angle/orientation optimisation: Yes
- Ironing: No
- Fuzzy skin: No
- Layer height: 0.20 mm

## Fit

- Infill: 15%
- Infill pattern: Rectilinear
- Wall loops: 2
- Material: PLA
- Colour: Dark Grey
- Shrinkage compensation: Yes
- Angle/orientation optimisation: No
- Ironing: No
- Fuzzy skin: No
- Layer height: 0.20 mm

## Function

- Infill: 30%
- Infill pattern: Rectilinear
- Wall loops: 3
- Material: PETG
- Colour: Dark Grey
- Shrinkage compensation: Yes
- Angle/orientation optimisation: No
- Ironing: No
- Fuzzy skin: No
- Layer height: 0.20 mm

## Visual

- Infill: 15%
- Infill pattern: Rectilinear
- Wall loops: 2
- Material: PLA
- Colour: Dark Grey
- Shrinkage compensation: No
- Angle/orientation optimisation: Yes
- Ironing: Yes
- Fuzzy skin: Yes
- Layer height: 0.15 mm

## Display Only

- Infill: 15%
- Infill pattern: Rectilinear
- Wall loops: 2
- Material: PLA
- Colour: Dark Grey
- Shrinkage compensation: No
- Angle/orientation optimisation: No
- Ironing: No
- Fuzzy skin: No
- Layer height: 0.20 mm

All profile values must be editable.

Profiles must be versioned.

When a project is quoted, store the exact profile values used at that time.

---

# 8. EMPIRICAL PRINT-TIME FACTORS

Use these as initial empirical calibration values, NOT as universal physical laws.

## Time Factors

| Factor | Extra Strong | Strength | Fit | Function | Visual | Display |
|---|---:|---:|---:|---:|---:|---:|
| Total | 31.88 | 18.07 | 1.05 | 3.63 | 1.64 | 1.00 |
| Infill | 4.59 | 3.92 | 1.00 | 1.68 | 1.00 | 1.00 |
| Infill type | 1.05 | 1.05 | 1.00 | 1.00 | 1.00 | 1.00 |
| Wall loops | 6.30 | 4.18 | 1.00 | 2.06 | 1.00 | 1.00 |
| Material | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Colour | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Shrinkage | 1.00 | 1.00 | 1.05 | 1.05 | 1.00 | 1.00 |
| Angle | 1.05 | 1.05 | 1.00 | 1.00 | 1.05 | 1.00 |
| Ironing | 1.00 | 1.00 | 1.00 | 1.00 | 1.10 | 1.00 |
| Fuzzy | 1.00 | 1.00 | 1.00 | 1.00 | 1.35 | 1.00 |
| Layer height | 1.00 | 1.00 | 1.00 | 1.00 | 1.05 | 1.00 |

---

# 9. EMPIRICAL MATERIAL FACTORS

Initial material factors:

| Factor | Extra Strong | Strength | Fit | Function | Visual | Display |
|---|---:|---:|---:|---:|---:|---:|
| Total | 30.35 | 17.14 | 1.05 | 3.70 | 1.06 | 1.00 |
| Infill | 4.83 | 4.11 | 1.00 | 1.71 | 1.00 | 1.00 |
| Infill type | 0.95 | 0.95 | 1.00 | 1.00 | 1.00 | 1.00 |
| Wall loops | 6.30 | 4.18 | 1.00 | 2.06 | 1.00 | 1.00 |
| Material | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Colour | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Shrinkage | 1.00 | 1.00 | 1.05 | 1.05 | 1.00 | 1.00 |
| Angle | 1.05 | 1.05 | 1.00 | 1.00 | 1.05 | 1.00 |
| Ironing | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Fuzzy | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Layer height | 1.00 | 1.00 | 1.00 | 1.00 | 1.01 | 1.00 |

These values must be treated as calibration data.

The application should learn over time from:

- Application estimate
- Slicer estimate
- Actual print
- Accepted/rejected outcome

Do not present empirical factors as fundamental physics.

---

# 10. PRINTER DATABASE

Create a printer database.

Initial printers:

- Bambu X1E
- Snapmaker U1
- Ender-3

The system must NOT simply rank printers by arbitrary assumptions.

Machine cost must be calculated from actual machine economics.

For each printer store:

- Purchase price
- Purchase date
- Expected service life
- Expected operating hours
- Residual value
- Maintenance cost
- Replacement parts
- Electricity consumption
- Operating overhead
- Maximum build volume
- Maximum print speed
- Supported materials
- Multi-colour capability
- Number of simultaneously loaded colours
- Labour requirements
- Failure rate
- Historical operating cost

The application should calculate a machine-hour cost.

The expected default relationship should be:

> Ender-3 = lowest machine cost  
> Snapmaker U1 = middle  
> Bambu X1E = highest

But this must be determined by the actual configured machine economics rather than hard-coded pricing.

---

# 11. MULTI-COLOUR PRINTING

Support multi-colour printing.

The system must support:

- Up to six colours in a model
- Four colours simultaneously loaded where the printer supports four
- Manual colour changes
- Pause-based material insertion
- Additional labour caused by colour changes
- Additional purge/waste material
- Additional print time

Colour-change labour must become part of the relevant cost calculation.

---

# 12. EMBEDDED HARDWARE

Support hardware inserted during printing.

Examples:

- Magnets
- NFC tags
- Nuts
- Screws
- Inserts
- Other embedded components

Each embedded operation should allow:

- Hardware cost
- Quantity
- Pause time
- Insertion labour
- Failure/rejection risk
- Additional material
- Operator notes

The system should include these operations in the production calculation.

---

# 13. MATERIAL DATABASE

Create a material database.

Each material should contain:

- Material name
- Manufacturer
- Type
- Colour
- Diameter
- Spool weight
- Purchase price
- Country
- Currency
- Supplier
- Price per kg
- Price per gram
- Waste factor
- Storage requirements
- Recommended printer
- Historical usage

Prioritise pricing data for:

- South Africa
- Netherlands
- China
- United States

Allow users to manually override all prices.

Do not assume international pricing is interchangeable.

---

# 14. MATERIAL COST

Material cost must be calculated from actual material usage.

Basic formula:

`Material Cost = Material Used × Cost per gram`

Where possible, use slicer material usage.

If no slicer data exists, use the application's calibrated estimate.

Include:

- Printed material
- Supports
- Purge
- Brims/rafts
- Failed-print material
- Other configured waste

Do not hide material cost inside a generic percentage.

Material is an actual production cost.

---

# 15. ELECTRICITY

Calculate electricity cost.

Inputs:

- Country
- Electricity tariff
- Printer power consumption
- Print time
- Idle/heat-up consumption where relevant

Formula should use actual configured tariff and estimated/actual consumption.

For South Africa, allow prepaid electricity tariffs to be entered/configured.

Do not hard-code one permanent tariff.

---

# 16. LABOUR

Labour must include the entire workflow, not merely time spent watching the printer.

Include configurable labour operations such as:

- Customer/order administration
- Reviewing model
- Preparing print
- Slicing
- Loading material
- Loading printer
- Colour changes
- Pausing for hardware
- Inserting hardware
- Unloading
- Removing part
- Inspection
- Cleaning
- Packaging
- Booking shipment
- Booking parts in/out
- Customer communication
- Invoice administration

Each operation should have:

- Time
- Labour rate
- Optional complexity multiplier

Labour rate must be configurable.

---

# 17. COST TO COMPANY

Create a clearly defined **Cost to Company (CTC)**.

The CTC represents the cost attributable to producing the part.

It may contain:

- Material
- Machine usage
- Electricity
- Direct labour
- Hardware
- Scrap/rejection allowance
- Other direct production costs
- Configurable general production allowance

The system should include a configurable **10% general allowance** by default.

Example:

Actual calculated production costs = R10

General allowance = 10%

CTC:

`R10 × 1.10 = R11`

The 10% allowance is configurable.

It is NOT shipping.

It is NOT the R90 delivery fee.

---

# 18. REJECTION AND SCRAP

Include rejection/scrap costs.

Default company setting:

**10%**

The system should support two modes:

1. Percentage allowance
2. Historical rejection-based calculation

Over time, actual rejection statistics should be able to replace or refine the assumed percentage.

Show:

- Expected scrap
- Actual scrap
- Scrap cost
- Accepted units
- Cost per accepted unit

---

# 19. RULE OF THIRDS PRICING MODEL

This is the primary company pricing model.

The normal target is:

### One third

**Cost to Company**

### One third

**Labour + Growth**

This covers the company's commercial/operational contribution such as:

- Labour recovery
- Marketing
- R&D
- Prototyping
- Administration
- Growth
- Business development
- Other company costs

### One third

**Profit + Capital**

This covers:

- Profit
- Loan repayment
- Equipment investment
- Capital recovery
- Retained earnings
- Future business capacity

Therefore:

`Part Price = CTC × 3`

This should be the default rule.

---

# 20. COMPANY ALLOCATION SETTINGS

The company wants configurable percentages for its internal cost/business structure.

Default values:

- Marketing: 20%
- R&D and Prototyping: 20%
- Rejections and Scrap: 10%
- Profit: 50%
- Admin Costs: 10%
- Machine Costs: 15%
- Labour: 10%
- Storage: 5%
- Packaging: 10%
- Handling: 2%

Every value must be editable.

The application must clearly distinguish between:

- Actual direct costs
- CTC allowances
- Internal company allocations
- Commercial markup
- Profit

Do not blindly add all these percentages together.

The values above must be configurable **allocation/allowance settings**, not automatically interpreted as percentages of the final invoice.

The system must prevent double-counting.

For example, if machine depreciation is already included in the CTC, a second "Machine Cost 15%" must not silently charge the customer for the same cost again.

---

# 21. SHIPPING

Shipping is completely separate from the rule-of-thirds part price.

For South Africa, create a default configurable shipping option:

**PUDO locker — R90**

Shipping should depend on package size/locker size where applicable.

The application should support:

- Small
- Medium
- Large
- Extra Large
- Courier
- Customer collection
- Express
- International
- Custom shipping

Each shipping method should have:

- Base price
- Package size
- Country
- Carrier
- Delivery speed
- Optional insurance
- Optional surcharge

The default South African PUDO shipping value may be R90, but it must be editable.

---

# 22. FREE SHIPPING

Create a configurable free-shipping threshold.

Default:

**Free shipping for part orders above R900**

The threshold is based on the **part selling value**, not the shipping cost.

Example:

Part CTC = R300

Part price = R900

Shipping = R0

The system should allow the company to change:

- Free-shipping threshold
- Whether threshold applies before/after discounts
- Whether it applies per part or per order

Shipping remains outside the thirds calculation.

---

# 23. PACKAGING

Packaging must be separate from the part's thirds pricing when it is an order fulfilment expense.

Create a packaging database containing:

- Box
- Envelope
- Padded bag
- Protective material
- Tape
- Labels
- Other packaging

Each item has:

- Cost
- Dimensions
- Weight
- Quantity
- Supplier

Packaging may be automatically selected based on part/package dimensions.

Allow manual override.

---

# 24. HANDLING

Handling is a small operational charge.

Default:

**2%**

Handling may cover:

- Booking parts in
- Booking parts out
- Order processing
- Movement between storage/production
- Basic fulfilment administration

Make it configurable.

Where actual labour is already explicitly recorded, the system must prevent double-counting.

---

# 25. STORAGE

Default storage allowance:

**5%**

Storage can be calculated using:

- Percentage model
- Shelf/bin cost
- Volume
- Time stored
- Actual warehouse cost

The company should be able to choose the method.

---

# 26. DEMAND PRICING

Create a **Demand Multiplier**.

Default:

**1.00**

Examples:

- 0.80 = low demand / 20% reduction
- 1.00 = normal demand
- 1.20 = high demand
- 1.50 = very high demand

The demand multiplier should NOT alter:

- Material cost
- Electricity
- Machine physics
- Actual production time
- Actual CTC

It changes the commercial price.

The default recommended behaviour is:

> Apply the demand multiplier to the **commercial/profit component**, rather than the physical production cost.

For example:

CTC = R100

Normal:

- CTC = R100
- Commercial allocation = R100
- Profit/capital = R100
- Part price = R300

At demand multiplier 0.80:

- CTC remains R100
- Commercial components remain configurable
- Profit/commercial component is reduced according to the configured demand model
- Customer receives a lower price

At 1.20:

- CTC remains R100
- Commercial component increases
- Customer receives a higher price

This must be configurable.

---

# 27. AUTOMATIC DEMAND BASED ON CAPACITY

Allow automatic demand calculation from production capacity.

Default example:

| Capacity utilisation | Demand multiplier |
|---|---:|
| 0–30% | 0.80 |
| 30–60% | 0.90 |
| 60–80% | 1.00 |
| 80–90% | 1.10 |
| 90–95% | 1.25 |
| 95–100% | 1.50 |
| >100% | 1.75 |

These are starting defaults only.

Make all thresholds editable.

Capacity can be based on:

- Printer hours
- Available machine hours
- Labour capacity
- Queue size
- Current workload
- Delivery deadlines

The purpose is commercial load balancing:

> When the company is overloaded, prices rise and low-value customers are naturally filtered out. When capacity is available, prices can fall to attract work.

---

# 28. CUSTOMER DISCOUNTS

Customer discount must be separate from demand.

Support:

- No discount
- Percentage discount
- Fixed amount
- Volume discount
- Customer-specific pricing
- Promotional pricing

Discount must be shown separately from demand.

Example:

Base price → Demand adjustment → Customer discount → Final part price.

---

# 29. VOLUME PRICING

Support quantity pricing.

For example:

- 1 unit
- 5 units
- 10 units
- 25 units
- 50 units
- 100 units

Quantity discounts should account for:

- Reduced setup time
- Same print job containing multiple parts
- Reduced handling per part
- Reduced packaging cost
- Material efficiency
- Printer utilisation

Do not assume ten parts always cost ten times one part.

---

# 30. FINAL CUSTOMER PRICE

The final customer invoice should be conceptually:

`Part Cost/Price`
+
`Packaging`
+
`Shipping`
+
`Other selected fulfilment services`
-
`Customer discount`

The thirds model applies to the **part price**, not to shipping.

Always show internally:

### Production / CTC

What it costs the company.

### Part Price

The normal selling price according to the company's pricing model.

### Order Extras

Packaging, shipping, express service, etc.

### Final Invoice

What the customer actually pays.

---

# 31. QUOTES

Generate professional quotes containing:

- Company information
- Quote number
- Customer
- Date
- Validity period
- Parts
- Quantities
- Unit price
- Quantity
- Subtotal
- Shipping
- Packaging
- Discount
- Tax/VAT if enabled
- Total
- Lead time
- Terms

Do not expose internal profit percentages unless explicitly configured.

---

# 32. INVOICES

Generate invoices containing:

- Invoice number
- Customer
- Project
- Parts
- Quantity
- Unit price
- Shipping
- Packaging
- Discounts
- VAT/tax
- Total
- Payment status

Support invoice status:

- Draft
- Sent
- Paid
- Partially paid
- Overdue
- Cancelled

---

# 33. COUNTRY AND CURRENCY

Support country-specific settings.

Initial priority:

- South Africa
- Netherlands
- China
- United States

Each country should support:

- Currency
- Electricity
- Shipping
- Tax/VAT
- Labour rates
- Material prices
- Printer costs
- Packaging
- Regional suppliers

South Africa should default to ZAR.

Do not hard-code South African values into the global system.

---

# 34. DASHBOARD

Create a business dashboard showing:

- Active projects
- Open quotes
- Orders
- Revenue
- CTC
- Profit
- Profit margin
- Printer utilisation
- Material consumption
- Rejection rate
- Accepted parts
- Cost per accepted part
- Current production load
- Demand multiplier
- Free capacity
- Best/worst printers
- Best/worst materials
- Most profitable parts
- Most frequently rejected parts

Allow filtering by:

- Date
- Customer
- Project
- Printer
- Material
- Part
- Print profile

---

# 35. PROJECT ANALYTICS

Each project should show:

- Total CTC
- Total selling price
- Total profit
- Total material
- Total machine time
- Total labour
- Total shipping
- Total packaging
- Number of parts
- Accepted parts
- Rejected parts
- Estimated vs actual performance

For each part show historical comparisons.

---

# 36. ESTIMATE → SLICER → ACTUAL LEARNING

The system should maintain three levels:

### Application estimate

Based on geometry and calibrated print profiles.

### Slicer estimate

Actual slicer output when available.

### Actual

What happened during production.

Compare all three.

The application should calculate:

- Time error
- Material error
- Cost error
- Rejection error

Use this information to improve future estimates.

Never silently rewrite historical calculations.

---

# 37. PRINTER COMPARISON

Allow the same part to be evaluated on different printers.

Show:

- Estimated time
- Material
- Electricity
- Machine cost
- Labour
- CTC
- Part price
- Capacity
- Profit
- Expected lead time

This should make it possible to determine whether a cheaper printer actually produces a cheaper part.

---

# 38. FAILED PRINTS

Record failed prints.

For every failed print:

- Part
- Printer
- Material
- Time
- Material
- Labour
- Failure reason
- Cost
- Whether reprinted
- Root cause
- Corrective action

Failed production must contribute to actual business cost and historical performance.

---

# 39. INVENTORY

Inventory should track:

### Filament

- Spool
- Material
- Colour
- Weight remaining
- Cost
- Supplier
- Batch
- Location

### Hardware

- Magnets
- NFC tags
- Screws
- Nuts
- Inserts
- Other components

### Packaging

- Boxes
- Bags
- Tape
- Labels
- Protective materials

Inventory should automatically reduce when production occurs.

Allow manual stock adjustments.

---

# 40. FILE MANAGEMENT

Projects should be able to contain:

- STL
- 3MF
- STEP
- CAD exports
- Images
- Documents
- Slicer files
- Quote
- Invoice

Maintain revision history.

Never overwrite a released project without preserving its previous version.

---

# 41. CALCULATION ENGINE

Create ONE central calculation engine.

Do not duplicate pricing logic across screens.

Conceptual flow:

`3D Model`
→ `Print Intent`
→ `Print Settings`
→ `Printer`
→ `Slicer Estimate`
→ `Material Usage`
→ `Machine Time`
→ `Electricity`
→ `Direct Labour`
→ `Hardware`
→ `Scrap/Rejection`
→ `CTC Allowance`
→ **Cost to Company**
→ **Rule-of-Thirds Part Price**
→ `Demand Adjustment`
→ `Customer Discount`
→ `Packaging`
→ `Shipping`
→ `Other Order Extras`
→ **Final Invoice**

The calculation engine must return a detailed breakdown.

---

# 42. COST CALCULATION OUTPUT

For every quote, allow the user to expand the calculation.

Show:

### Production

- Material
- Machine
- Electricity
- Labour
- Hardware
- Scrap
- Allowance
- CTC

### Commercial

- Labour/Growth allocation
- Profit/Capital allocation
- Demand adjustment

### Order

- Packaging
- Shipping
- Other services
- Discount

### Final

- Part price
- Shipping
- Extras
- Discount
- Tax
- Final invoice

---

# 43. THREE-NUMBER DISPLAY

Always make these three values easy to understand internally:

**1. Cost to Company**

What the company spends to make the part.

**2. Part Selling Price**

What the company's rule-of-thirds model says the part should sell for.

**3. Final Invoice**

What the customer actually pays after shipping, packaging, discounts, etc.

This separation is critical.

---

# 44. SETTINGS

Create comprehensive settings for:

- Company
- Currency
- Country
- Tax
- Labour
- Printers
- Materials
- Electricity
- Shipping
- Packaging
- Handling
- Storage
- Scrap
- CTC allowance
- Rule of thirds
- Marketing
- R&D
- Admin
- Profit
- Capital recovery
- Demand
- Discounts
- Quantity pricing
- Customer pricing
- Print profiles
- Calibration factors

Every default should be editable.

---

# 45. PRICING PRESETS

Create presets such as:

### Standard

Normal rule-of-thirds pricing.

### Startup

Lower commercial/profit component to attract customers.

### High Demand

Higher commercial/profit component.

### Prototype

Different R&D/labour allocation.

### Internal

Cost-only or special internal pricing.

### Customer Discount

Preset discount structure.

Presets must be versioned.

---

# 46. DATABASE DESIGN

Use a proper relational/data-model approach.

Core entities should include:

- Company
- User
- Customer
- Project
- Part
- PartRevision
- ModelFile
- Printer
- PrinterHistory
- Material
- MaterialSpool
- Hardware
- Packaging
- PrintProfile
- PrintProfileVersion
- PrintJob
- PrintAttempt
- CostCalculation
- PricingProfile
- DemandProfile
- ShippingMethod
- Quote
- QuoteRevision
- Invoice
- InventoryTransaction
- LabourOperation
- CalibrationData

The database must preserve historical calculations.

---

# 47. SECURITY

Customer-uploaded files must be separated appropriately.

Do not expose internal company settings through the customer-facing quote system.

Protect:

- Pricing rules
- Profit
- Supplier prices
- Internal cost
- Customer information
- Uploaded CAD files
- Company settings

Use proper authentication and access control if the app is deployed as a multi-user service.

---

# 48. RESPONSIVE DESIGN

The application should work on:

- Desktop
- Laptop
- Tablet
- Mobile

Desktop should provide the richest interface.

Mobile should prioritise:

- Quotes
- Orders
- Production status
- Simple costing
- Project overview

---

# 49. ENGINEERING PRINCIPLES

The application must never knowingly introduce false physics.

Where an estimate is empirical, call it an estimate.

Where a value is an assumption, state the assumption.

Where actual slicer data exists, prefer it over generic assumptions.

Where company-specific historical data exists, allow it to improve the estimate.

Do not present calibration factors as universal truths.

The system must distinguish:

- Physics
- Geometry
- Slicer behaviour
- Empirical calibration
- Company assumptions
- Commercial pricing decisions

---

# 50. EXAMPLE

Suppose a part has:

- Material = R4
- Machine = R2
- Electricity = R0.50
- Labour = R1
- Hardware = R1
- Other production costs = R0.50

Actual production cost:

`R9`

10% configurable CTC allowance:

`R0.90`

CTC:

`R9.90`

Rule of thirds:

- CTC = R9.90
- Labour + Growth = R9.90
- Profit + Capital = R9.90

Normal part price:

**R29.70**

Then shipping:

**R90**

Final customer amount:

**R119.70**

If the order qualifies for free shipping:

**R29.70**

If demand is 0.80 and the configured demand model reduces the commercial/profit component accordingly, the part price decreases while the physical CTC remains R9.90.

The system must clearly show why the final number changed.

---

# 51. IMPORTANT PRICING RULE

Do NOT implement the original list of percentages as:

`CTC × (1 + 20% + 20% + 10% + 50% + 10% + 15% + 10% + 5% + 10% + 2%)`

That would produce an arbitrary 152% markup and would not represent the intended business model.

Instead:

**First establish CTC.**

Then:

**Use the rule of thirds to establish the normal part selling price.**

Then:

**Use company percentages to allocate/manage the commercial portions internally.**

Then:

**Apply demand.**

Then:

**Apply customer discounts.**

Then:

**Add shipping and other order extras.**

This avoids double-counting and keeps the economics understandable.

---

# 52. FINAL ARCHITECTURE

The complete conceptual architecture is:

### A. MODEL

What is being printed?

### B. PRINT INTENT

What is the purpose of the part?

### C. PRINT CONFIGURATION

How will it be printed?

### D. PRINTER

Which machine will produce it?

### E. MATERIAL

What material will be consumed?

### F. PRODUCTION

How much time, material, electricity, labour and hardware are required?

### G. CTC

What does it actually cost the company?

### H. RULE OF THIRDS

`CTC × 3 = normal part selling price`

### I. DEMAND

Should the commercial price increase or decrease based on workload?

### J. CUSTOMER PRICING

Apply customer-specific or volume discounts.

### K. ORDER EXTRAS

Add:

- Packaging
- Shipping
- Express delivery
- Other fulfilment services

These remain outside the thirds.

### L. FINAL INVOICE

Show the customer exactly what they owe.

---

# 53. PRIMARY DEVELOPMENT GOAL

Build this as a **real usable application**, not a mock-up.

The UI should feel simple and polished.

The calculation engine should be robust and transparent.

The system should be capable of starting with approximate estimates and progressively becoming more accurate as real slicer and production data are collected.

Every important number should have a traceable origin.

Every company assumption should be editable.

Every historical quote should remain reproducible.

The final application should allow a small 3D-printing business to move from:

**3D model → estimate → quote → production → inventory → shipping → invoice → actual cost → profitability analysis**

within one coherent system.

The most important commercial principle is:

> **The part price is based on the Cost to Company using a rule of thirds. Shipping and other order fulfilment costs are separate and are added afterwards.**

The application should make this principle obvious while still allowing an advanced user to modify the underlying business model when required.