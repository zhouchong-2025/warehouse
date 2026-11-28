# Datasheet_TPL8031Q-S

Source: Datasheet_TPL8031Q-S.pdf
Pages: 22

## Page 1

Features
•
Qualified for Automotive Applications
–
AEC-Q100 Grade 1, TA: −40°C to +125°C
–
Junction Temperature, TJ: −40°C to +150°C
•
Input Voltage: 3 V to 42 V
•
Output Voltage:
–
Fixed 5 V and 3.3 V
•
±2.5% Output Accuracy Over Line Regulation, Load
Regulation, and Operating Temperature Range
•
Low Current Consumption:
–
400-nA Shutdown Current
–
3-μA Typical Quiescent Current
•
300-mA Maximum Output Current
•
Low Dropout Voltage: 720 mV Maximum at 200 mA
Load Current
•
Stable with 1-μF to 200-μF Output Capacitor with ESR
Range from 0.001 Ω to 10 Ω
•
Integrated Protection:
–
Over-Current Protection
–
Over-Temperature Protection
•
Package Options:
–
DFN3X3-8
–
EMSOP8
–
SOT223-3
Applications
•
Automotive Clusters and Infotainment
•
Automotive Headlights and Interior Lighting
•
Automotive Domain Control
•
Automotive BCM and Door Handler
Description
The TPL8031Q series supports operating with 3 V to 42
V (45-V maximum transient voltage). Operating with as
low as 3 V allows the TPL8031Q to continue to work well
during cold-crank and start-stop conditions.
The TPL8031Q products are 3-μA ultra-low quiescent low
dropout voltage linear regulators with 300-mA maximum
output current capability.
With the above features, the TPL8031Q products are
the optimal solutions for powering the MCU, CAN/LIN
transceivers in the always-on applications, and the battery-
connected applications in the automotive systems.
The TPL8031Q series provides fixed 5-V and 3.3-V output
voltage options, and the TPL8031Q series supports a
wide range of output capacitors from 1 μF to 200 μF
with an ESR range from 0.001 Ω to 10 Ω. Also, the
TPL8031Q series integrates over-current protection and
over-temperature protection.
The 
TPL8031Q 
series 
operates 
in 
the 
ambient
temperature range from −40°C to +125°C. Additionally, the
TPL8031Q series provides thermal-enhanced packages of
DFN3X3-8, EMSOP8, and SOT223-3 to enable sustained
operation despite significant dissipation across the device.
Typical Application Circuit
VIN
VOUT
EN
GND
Input
Off On
TPL8031Q
COUT = 10 µF
Output
CIN = 10 µF
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
1 / 22
DA20230602A1

## Page 2

Table of Contents
Features................................................................................................................................................................1
Applications......................................................................................................................................................... 1
Description...........................................................................................................................................................1
Typical Application Circuit..................................................................................................................................1
Product Family Table...........................................................................................................................................3
Revision History...................................................................................................................................................3
Pin Configuration and Functions....................................................................................................................... 4
Specifications.......................................................................................................................................................5
Absolute Maximum Ratings ...........................................................................................................................5
ESD, Electrostatic Discharge Protection........................................................................................................ 5
Recommended Operating Conditions............................................................................................................ 5
Thermal Information........................................................................................................................................5
Electrical Characteristics................................................................................................................................ 6
Typical Performance Characteristics..............................................................................................................7
Detailed Description.......................................................................................................................................... 11
Overview.......................................................................................................................................................11
Functional Block Diagram.............................................................................................................................11
Feature Description.......................................................................................................................................11
Application and Implementation...................................................................................................................... 13
Application Information ................................................................................................................................13
Typical Application........................................................................................................................................13
Layout.................................................................................................................................................................14
Layout Guideline...........................................................................................................................................14
Tape and Reel Information................................................................................................................................15
Package Outline Dimensions........................................................................................................................... 17
DFN3X3-8.....................................................................................................................................................17
EMSOP8.......................................................................................................................................................18
SOT223-3.....................................................................................................................................................19
Order Information.............................................................................................................................................. 20
IMPORTANT NOTICE AND DISCLAIMER.........................................................................................................21
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
2 / 22
DA20230602A1

## Page 3

Product Family Table
Order Number
Output Voltage (V)
Package
TPL803133Q-DF6R-S
3.3 V
DFN3X3-8
TPL803150Q-DF6R-S
5.0 V
DFN3X3-8
TPL803133Q-EV1R-S
3.3 V
EMSOP8
TPL803150Q-EV1R-S
5.0 V
EMSOP8
TPL803133Q-ST4R-S
3.3 V
SOT223-3
TPL803150Q-ST4R-S
5.0 V
SOT223-3
Revision History
Date
Revision
Notes
2022-03-21
Rev.Pre.0
Preliminary Datasheet.
2023-04-28
Rev.Pre.1
Updated Pin Map of EMSOP8 Package.
2023-05-31
Rev.Pre.2
1. Updated Thermal Information
2. Updated Electrical Characteristics Table.
2023-06-15
Rev.A.0
Initial Released.
2025-08-26
Rev.A.1
The following updates are all about new formats or typo corrections. The actual
product remains unchanged.
•
Added description to POD information required by packaging reference
standards.
•
Updated the Tape and Reel Information.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
3 / 22
DA20230602A1

### Tables on Page 3

#### Table 1

| Order Number | Output Voltage (V) | Package |
| --- | --- | --- |
| TPL803133Q-DF6R-S | 3.3 V | DFN3X3-8 |
| TPL803150Q-DF6R-S | 5.0 V | DFN3X3-8 |
| TPL803133Q-EV1R-S | 3.3 V | EMSOP8 |
| TPL803150Q-EV1R-S | 5.0 V | EMSOP8 |
| TPL803133Q-ST4R-S | 3.3 V | SOT223-3 |
| TPL803150Q-ST4R-S | 5.0 V | SOT223-3 |

#### Table 2

| Date | Revision | Notes |
| --- | --- | --- |
| 2022-03-21 | Rev.Pre.0 | Preliminary Datasheet. |
| 2023-04-28 | Rev.Pre.1 | Updated Pin Map of EMSOP8 Package. |
| 2023-05-31 | Rev.Pre.2 | 1. Updated Thermal Information<br/>2. Updated Electrical Characteristics Table. |
| 2023-06-15 | Rev.A.0 | Initial Released. |
| 2025-08-26 | Rev.A.1 | The following updates are all about new formats or typo corrections. The actual<br/>product remains unchanged.<br/>• Added description to POD information required by packaging reference<br/>standards.<br/>• Updated the Tape and Reel Information. |

## Page 4

Pin Configuration and Functions
DFN3X3-8 Package
Top View
EMSOP8 Package
Top View
IN
GND
NC
EN
NC
OUT
NC
8
7
6
5
1
2
3
4
NC
Exposed 
Pad
IN
8
7
6
5
1
2
3
4
EN
NC
GND
NC
NC
NC
OUT
SOT223-3 Package
Top View
1
2
3
GND
GND
IN
OUT
4
Table 1. Pin Functions: TPL8031Q-S
Pin Number
Pin Name
I/O
Description
DFN3X3-8
EMSOP8
SOT223-3
8
2
–
EN
I
Regulator enable pin. Drive EN high to turn on the regulator;
drive EN low to turn off the regulator.
3
4
2, 4
GND
I
Ground reference pin. Connect GND pin to PCB ground plane
directly.
1
1
1
IN
I
Input voltage pin. Bypass IN to GND with a 1 μF or greater
capacitor.
4, 5, 7
3, 5, 6, 7
–
NC
-
No connection.
6
8
3
OUT
O
Regulated output voltage pin. Bypass OUT to GND with a 1 μF
or greater capacitor.
(1) Thermal Pad MUST be connected to PCB ground plane directly.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
4 / 22
DA20230602A1

### Tables on Page 4

#### Table 3

| Pin Number |  |  | Pin Name | I/O | Description |
| --- | --- | --- | --- | --- | --- |
| DFN3X3-8 | EMSOP8 | SOT223-3 |  |  |  |
| 8 | 2 | – | EN | I | Regulator enable pin. Drive EN high to turn on the regulator;<br/>drive EN low to turn off the regulator. |
| 3 | 4 | 2, 4 | GND | I | Ground reference pin. Connect GND pin to PCB ground plane<br/>directly. |
| 1 | 1 | 1 | IN | I | Input voltage pin. Bypass IN to GND with a 1 μF or greater<br/>capacitor. |
| 4, 5, 7 | 3, 5, 6, 7 | – | NC | - | No connection. |
| 6 | 8 | 3 | OUT | O | Regulated output voltage pin. Bypass OUT to GND with a 1 μF<br/>or greater capacitor. |

## Page 5

Specifications
Absolute Maximum Ratings
Parameter
Min
Max
Unit
EN, IN
−0.3
45
V
OUT
−0.3
6
V
TJ
Junction Temperature Range
−40
150
°C
TSTG
Storage Temperature Range
−65
150
°C
TL
Lead Temperature (Soldering 10 sec)
260
°C
(1) Stresses beyond those listed under Absolute Maximum Ratings may cause permanent damage to the device. Exposure
to any Absolute Maximum Rating condition for extended periods may affect device reliability and lifetime.
(2) All voltage values are with respect to GND.
ESD, Electrostatic Discharge Protection
Symbol
Parameter
Condition
Minimum Level
Unit
HBM
Human Body Model ESD
AEC Q100-002
±2
kV
CDM
Charged Device Model ESD
AEC Q100-011
±1
kV
Recommended Operating Conditions
Parameter
Min
Max
Unit
IN
3
42
V
EN
0
VIN
V
COUT
Output Capacitor Requirements
1
200
µF
ESR
Output Capacitor ESR Requirements
0.001
10
Ω
TA
Ambient Temperature Range
−40
125
°C
TJ
Junction Temperature Range
−40
150
°C
Thermal Information
Package Type
θJA
θJB
θJC,top
θJC,bottom
Unit
DFN3X3-8
45.0
42.0
88.8
10.7
°C/W
EMSOP8
45.6
43.3
95.2
12.8
°C/W
SOT223-3
65.0
40.0
60.0
15.0
°C/W
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
5 / 22
DA20230602A1

### Tables on Page 5

#### Table 1

| Parameter |  | Min | Max | Unit |
| --- | --- | --- | --- | --- |
| N, IN |  | −0.3 | 45 | V |
| UT |  | −0.3 | 6 | V |
| J | Junction Temperature Range | −40 | 150 | °C |
| STG | Storage Temperature Range | −65 | 150 | °C |
| L | Lead Temperature (Soldering 10 sec) |  | 260 | °C |

#### Table 2

| Symbol | Parameter | Condition | Minimum Level | Unit |
| --- | --- | --- | --- | --- |
| BM | Human Body Model ESD | AEC Q100-002 | ±2 | kV |
| DM | Charged Device Model ESD | AEC Q100-011 | ±1 | kV |

#### Table 3

| Parameter |  | Min | Max | Unit |
| --- | --- | --- | --- | --- |
| N |  | 3 | 42 | V |
| N |  | 0 | V<br/>IN | V |
| OUT | Output Capacitor Requirements | 1 | 200 | µF |
| SR | Output Capacitor ESR Requirements | 0.001 | 10 | Ω |
| A | Ambient Temperature Range | −40 | 125 | °C |
| J | Junction Temperature Range | −40 | 150 | °C |

#### Table 4

| Package Type | θ<br/>JA | θ<br/>JB | θ<br/>JC,top | θ<br/>JC,bottom | Unit |
| --- | --- | --- | --- | --- | --- |
| DFN3X3-8 | 45.0 | 42.0 | 88.8 | 10.7 | °C/W |
| EMSOP8 | 45.6 | 43.3 | 95.2 | 12.8 | °C/W |
| SOT223-3 | 65.0 | 40.0 | 60.0 | 15.0 | °C/W |

## Page 6

Electrical Characteristics
All test conditions: VIN = 13.5 V, VEN = 2 V, CIN = COUT = 10 µF, IOUT = 0.1 mA. TA = −40°C to +125°C, TJ = −40°C to 150°C,
unless otherwise noted.
Symbol
Parameter
Conditions
Min
Typ
Max
Unit
Supply Input Voltage and Current
VIN
Input Supply Voltage Range (1)
VIN,MIN
42
V
UVLO
VIN Under-Voltage Lockout
Threshold
VIN rising, VEN = 2 V, IOUT = 200
mA
2.6
2.8
V
Hysteresis
260
mV
ISD
Shutdown Current
VEN = 0 V
0.4
2
µA
IQ
Quiescent Current
IOUT = 0 mA
3
5.5
µA
IOUT = 0.1 mA
4
6.5
µA
Enable Input Voltage and Current
VIH,EN
EN Logic Input High (Enable)
1.4
VIN
V
VIL,EN
EN Logic Input Low (Disable)
0
0.7
V
IEN
EN Pin Leakage Current
VEN = 2 V to 42 V
−200
200
nA
Regulated Output Voltage and Current
VOUT
Output Accuracy
VIN = 6 V to 42 V, IOUT = 1 mA to
300 mA
−2.5%
2.5%
ΔVOUT
Line Regulation
VIN = 6 V to 42 V, IOUT = 10 mA
0.1
mV
Load Regulation
IOUT = 1 mA to 300 mA
5
mV
VDO
Dropout Voltage (2)
IOUT = 100 mA, VOUT = 3.3 V
280
450
mV
IOUT = 200 mA, VOUT = 3.3 V
580
900
mV
IOUT = 100 mA, VOUT = 5 V
220
360
mV
IOUT = 200 mA, VOUT = 5 V
440
720
mV
IOUT
Output Current Range
VOUT in regulation
0
300
mA
ICL
Output Current Limit
VOUT is forced to 0.9*VOUT(NOM)
320
500
900
mA
tSU
Start-Up Time (3)
2
ms
PSRR
Power Supply Rejection Ratio (3)
IOUT = 10 mA, f = 1 kHz
65
dB
IOUT = 10 mA, f = 100 kHz
50
dB
IOUT = 10 mA, f = 1 MHz
40
dB
Temperature Range
TSD
Thermal Shutdown Threshold
175
°C
Thermal Shutdown Hysteresis
20
°C
(1) VIN,MIN = 3 V or VOUT(NOM) + 1 V, whichever is greater.
(2) Dropout voltage is the minimum input to output voltage differential needed to maintain regulation at a specified output
current. Dropout voltage is measured when the output voltage has dropped 100 mV from the nominal value. In dropout,
the output voltage will be equal to (VIN – VDO).
(3) Not test during production.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
6 / 22
DA20230602A1

### Tables on Page 6

#### Table 1

| Symbol | Parameter | Conditions | Min | Typ | Max | Unit |
| --- | --- | --- | --- | --- | --- | --- |
| upply Input Voltage and Current |  |  |  |  |  |  |
| IN | Input Supply Voltage Range (1) |  | V<br/>IN,MIN |  | 42 | V |
| VLO | V Under-Voltage Lockout<br/>IN<br/>Threshold | VIN rising, V = 2 V, I = 200<br/>EN OUT<br/>mA |  | 2.6 | 2.8 | V |
|  | Hysteresis |  |  | 260 |  | mV |
| SD | Shutdown Current | V = 0 V<br/>EN |  | 0.4 | 2 | µA |
| Q | Quiescent Current | I = 0 mA<br/>OUT |  | 3 | 5.5 | µA |
|  |  | I = 0.1 mA<br/>OUT |  | 4 | 6.5 | µA |
| nable Input Voltage and Current |  |  |  |  |  |  |
| IH,EN | EN Logic Input High (Enable) |  | 1.4 |  | V<br/>IN | V |
| IL,EN | EN Logic Input Low (Disable) |  | 0 |  | 0.7 | V |
| EN | EN Pin Leakage Current | V = 2 V to 42 V<br/>EN | −200 |  | 200 | nA |
| egulated Output Voltage and Current |  |  |  |  |  |  |
| OUT | Output Accuracy | V = 6 V to 42 V, I = 1 mA to<br/>IN OUT<br/>300 mA | −2.5% |  | 2.5% |  |
| V<br/>OUT | Line Regulation | V = 6 V to 42 V, I = 10 mA<br/>IN OUT |  | 0.1 |  | mV |
|  | Load Regulation | I = 1 mA to 300 mA<br/>OUT |  | 5 |  | mV |
| DO | Dropout Voltage (2) | I = 100 mA, V = 3.3 V<br/>OUT OUT |  | 280 | 450 | mV |
|  |  | I = 200 mA, V = 3.3 V<br/>OUT OUT |  | 580 | 900 | mV |
|  |  | I = 100 mA, V = 5 V<br/>OUT OUT |  | 220 | 360 | mV |
|  |  | I = 200 mA, V = 5 V<br/>OUT OUT |  | 440 | 720 | mV |
| OUT | Output Current Range | V in regulation<br/>OUT | 0 |  | 300 | mA |
| CL | Output Current Limit | V is forced to 0.9*V<br/>OUT OUT(NOM) | 320 | 500 | 900 | mA |
| SU | Start-Up Time (3) |  |  | 2 |  | ms |
| SRR | Power Supply Rejection Ratio (3) | I = 10 mA, f = 1 kHz<br/>OUT |  | 65 |  | dB |
|  |  | I = 10 mA, f = 100 kHz<br/>OUT |  | 50 |  | dB |
|  |  | I = 10 mA, f = 1 MHz<br/>OUT |  | 40 |  | dB |
| emperature Range |  |  |  |  |  |  |
| SD | Thermal Shutdown Threshold |  |  | 175 |  | °C |
|  | Thermal Shutdown Hysteresis |  |  | 20 |  | °C |

## Page 7

Typical Performance Characteristics
All test conditions: VIN = 13.5 V, VEN = 2 V, CIN = COUT = 10 µF, IOUT = 0.1 mA. TA = −40°C to +125°C, TJ = −40°C to 150°C,
unless otherwise noted.
0
500
1000
1500
2000
2500
3000
3500
4000
0
5
10
15
20
25
30
35
40
Quiescent Current (uA)
Input Voltage (V)
IOUT = 0.1 mA
IOUT = 1 mA
IOUT = 10 mA
IOUT = 100 mA
VOUT = 5 V
Figure 1. Quiescent Current vs. Input Voltage
0
150
300
450
600
750
900
0
50
100
150
200
250
300
Quiescent Current (uA)
Load Current (mA)
-40℃
0℃
25℃
85℃
125℃
VOUT = 5 V
Figure 2. Quiescent Current vs. Load Current
0
0.1
0.2
0.3
0.4
0.5
0.6
0.7
0.8
0.9
1
-40
-25
-10
5
20
35
50
65
80
95
110
125
Shutdown Current (uA)
Temperature (℃)
VEN = 0 V
Figure 3. Shutdown Current vs. Ambient Temperature
0
100
200
300
400
500
-40
-25
-10
5
20
35
50
65
80
95
110
125
Quiescent Current (uA)
Temperature (℃)
IOUT = 1 mA
IOUT = 10 mA
IOUT = 50 mA
IOUT = 100 mA
IOUT = 150 mA
VOUT = 5 V
Figure 4. Quiescent Current vs. Ambient Temperature
0.0000
0.2000
0.4000
0.6000
0.8000
1.0000
1.2000
1.4000
0
50
100
150
200
250
300
Dropout Voltage (V)
Load Current (mA)
-40℃
25℃
125℃
VOUT = 3.3 V
Figure 5. Dropout Voltage vs. Load Current
0.0
0.2
0.4
0.6
0.8
1.0
1.2
1.4
-40
-25
-10
5
20
35
50
65
80
95
110
125
Dropout Voltage (V)
Temperature (℃)
IOUT = 10 mA
IOUT = 100 mA
IOUT = 300 mA
VOUT = 5 V
Figure 6. Dropout Voltage vs. Ambient Temperature
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
7 / 22
DA20230602A1

### Tables on Page 7

#### Table 1

| 4000<br/>3500<br/>3000<br/>(uA)<br/>2500 Current<br/>2000<br/>Quiescent<br/>1500<br/>IOUT = 0.1 mA<br/>IOUT = 1 mA<br/>1000<br/>IOUT = 10 mA<br/>IOUT = 100 mA<br/>500<br/>0<br/>0 5 10 15 20 25 30 35 40<br/>Input Voltage (V)<br/>= 5 V<br/>OUT<br/>Figure 1. Quiescent Current vs. Input Voltage | 900<br/>750<br/>(uA)<br/>600<br/>Current<br/>450<br/>Quiescent<br/>300<br/>-40℃ 0℃<br/>150<br/>25℃ 85℃<br/>125℃<br/>0<br/>0 50 100 150 200 250 300<br/>Load Current (mA)<br/>V = 5 V<br/>OUT<br/>Figure 2. Quiescent Current vs. Load Current |
| --- | --- |
| 1<br/>0.9<br/>0.8<br/>0.7 (uA)<br/>0.6 Current<br/>0.5<br/>Shutdown<br/>0.4<br/>0.3<br/>0.2<br/>0.1<br/>0<br/>-40 -25 -10 5 20 35 50 65 80 95 110 125<br/>Temperature (℃)<br/>= 0 V<br/>EN<br/>Figure 3. Shutdown Current vs. Ambient Temperature | 500<br/>400<br/>(uA)<br/>300 Current<br/>Quiescent<br/>200<br/>IOUT = 1 mA<br/>IOUT = 10 mA<br/>100 IOUT = 50 mA<br/>IOUT = 100 mA<br/>IOUT = 150 mA<br/>0<br/>-40 -25 -10 5 20 35 50 65 80 95 110 125<br/>Temperature (℃)<br/>V = 5 V<br/>OUT<br/>Figure 4. Quiescent Current vs. Ambient Temperature |
| 1.4000<br/>1.2000<br/>1.0000<br/>(V)<br/>Voltage<br/>0.8000<br/>0.6000 Dropout<br/>0.4000<br/>-40℃<br/>0.2000<br/>25℃<br/>0.0000 125℃<br/>0 50 100 150 200 250 300<br/>Load Current (mA)<br/>= 3.3 V<br/>OUT<br/>Figure 5. Dropout Voltage vs. Load Current | 1.4<br/>1.2<br/>1.0<br/>IOUT = 10 mA (V)<br/>Voltage<br/>0.8 IOUT = 100 mA<br/>IOUT = 300 mA<br/>0.6 Dropout<br/>0.4<br/>0.2<br/>0.0<br/>-40 -25 -10 5 20 35 50 65 80 95 110 125<br/>Temperature (℃)<br/>V = 5 V<br/>OUT<br/>Figure 6. Dropout Voltage vs. Ambient Temperature |

## Page 8

-0.50%
-0.30%
-0.10%
0.10%
0.30%
0.50%
-50
-30
-10
10
30
50
70
90
110
130
Output voltage  variation 
Temperature(ºC)
VOUT = 5 V
Figure 7. Output Voltage Variation vs. Ambient
Temperature
-0.5
0
0.5
1
1.5
2
2.5
3
3.5
4
4.5
5
5.5
0
5
10
15
20
25
30
35
40
Output Voltage (V)
Input Voltage (V)
-40℃
0℃
25℃
85℃
125℃
VOUT = 5 V , IOUT = 1 mA
Figure 8. Output Voltage vs. Input Voltage
0
100
200
300
400
500
600
700
-40
-25
-10
5
20
35
50
65
80
95
110
125
Current Limit (mA)
Temperature (℃)
VOUT = 5 V, force VOUT = 0.9×VOUT
Figure 9. Output Current Limit vs. Ambient Temperature
-1.00%
-0.50%
0.00%
0.50%
1.00%
0
5
10
15
20
25
30
35
40
45
Output Acurracy
Input Voltage (V)
-40℃
25℃
125℃
VOUT = 5 V
Figure 10. Line Regulation
-1.00%
-0.50%
0.00%
0.50%
1.00%
0
50
100
150
200
250
300
Output Acurracy
Load Current(mA)
TA = -40℃
TA = 25℃
TA = 125℃
VOUT = 5 V
Figure 11. Load Regulation
0
10
20
30
40
50
60
70
80
90
100
10
100
1,000
10,000
100,000
1,000,000
10,000,000
PSRR (dB)
Frequency (Hz)
IOUT = 1 mA
IOUT = 10 mA
IOUT = 100 mA
VOUT = 5 V
Figure 12. PSRR
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
8 / 22
DA20230602A1

### Tables on Page 8

#### Table 1

| 0.50%<br/>0.30% variation<br/>0.10% voltage<br/>Output<br/>-0.10%<br/>-0.30%<br/>-0.50%<br/>-50 -30 -10 10 30 50 70 90 110 130<br/>Temperature(ºC)<br/>= 5 V<br/>OUT<br/>Figure 7. Output Voltage Variation vs. Ambient<br/>Temperature | 5.5<br/>5<br/>4.5<br/>4 (V)<br/>3.5 Voltage<br/>3<br/>2.5 Output<br/>2<br/>1.5<br/>-40℃<br/>1<br/>0℃<br/>0.5 25℃<br/>0 85℃<br/>-0.5 125℃<br/>0 5 10 15 20 25 30 35 40<br/>Input Voltage (V)<br/>V = 5 V , I = 1 mA<br/>OUT OUT<br/>Figure 8. Output Voltage vs. Input Voltage |
| --- | --- |
| 700<br/>600<br/>500<br/>(mA)<br/>400 Limit<br/>300 Current<br/>200<br/>100<br/>0<br/>-40 -25 -10 5 20 35 50 65 80 95 110 125<br/>Temperature (℃)<br/>= 5 V, force V = 0.9×V<br/>OUT OUT OUT<br/>Figure 9. Output Current Limit vs. Ambient Temperature | 1.00%<br/>0.50%<br/>Acurracy<br/>0.00%<br/>Output<br/>-0.50% -40℃<br/>25℃<br/>125℃<br/>-1.00%<br/>0 5 10 15 20 25 30 35 40 45<br/>Input Voltage (V)<br/>V = 5 V<br/>OUT<br/>Figure 10. Line Regulation |
| 1.00%<br/>0.50%<br/>Acurracy<br/>0.00%<br/>Output<br/>-0.50% TA = -40℃<br/>TA = 25℃<br/>TA = 125℃<br/>-1.00%<br/>0 50 100 150 200 250 300<br/>Load Current(mA)<br/>= 5 V<br/>OUT<br/>Figure 11. Load Regulation | 100<br/>90<br/>80<br/>70<br/>(dB)<br/>60<br/>PSRR<br/>50<br/>40<br/>30<br/>20 IOUT = 1 mA<br/>10 IOUT = 10 mA<br/>IOUT = 100 mA<br/>0<br/>10 100 1,000 10,000 100,000 1,000,000 10,000,000<br/>Frequency (Hz)<br/>V = 5 V<br/>OUT<br/>Figure 12. PSRR |

## Page 9

0
5
10
15
20
25
30
35
10
100
1000
10000
100000
1000000
10000000
Noise(uV/rtHz)
Frequency (Hz)
IOUT = 1 mA
IOUT = 10 mA
IOUT = 100 mA
VOUT = 5 V
Figure 13. Noise
1
10
100
0.001
0.01
0.1
1
10
Output Capacitance(µF)
ESR(Ω)
Output Capacitance and ESR stability range
Figure 14. Output Capacitance vs. ESR stability
COUT = 1 µF, VIN = 0 V to 13.5 V, VOUT = 0 V to 5 V
Figure 15. Startup Waveform
COUT = 10 µF, VIN = 0 V to 13.5 V, VOUT = 0 V to 5 V
Figure 16. Startup Waveform
COUT = 1 µF, VIN = 6 V to 40 V in 30 µs
Figure 17. Line Transient
COUT = 10 µF, VIN = 6 V to 40 V in 30 µs
Figure 18. Line Transient
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
9 / 22
DA20230602A1

### Tables on Page 9

#### Table 1

| 35<br/>30<br/>25<br/>Noise(uV/rtHz)<br/>20<br/>15<br/>10<br/>IOUT = 1 mA<br/>IOUT = 10 mA<br/>5<br/>IOUT = 100 mA<br/>0<br/>10 100 1000 10000 100000 1000000 10000000<br/>Frequency (Hz)<br/>= 5 V<br/>OUT<br/>Figure 13. Noise | 100<br/>Capacitance(µF)<br/>10<br/>Output<br/>1<br/>0.001 0.01 0.1 1 10<br/>ESR(Ω)<br/>Output Capacitance and ESR stability range<br/>Figure 14. Output Capacitance vs. ESR stability |
| --- | --- |
| = 1 µF, V = 0 V to 13.5 V, V = 0 V to 5 V<br/>OUT IN OUT<br/>Figure 15. Startup Waveform | C = 10 µF, V = 0 V to 13.5 V, V = 0 V to 5 V<br/>OUT IN OUT<br/>Figure 16. Startup Waveform |
| = 1 µF, V = 6 V to 40 V in 30 µs<br/>OUT IN<br/>Figure 17. Line Transient | C = 10 µF, V = 6 V to 40 V in 30 µs<br/>OUT IN<br/>Figure 18. Line Transient |

## Page 10

COUT = 1 µF, IOUT = 10 mA to 100 mA in 5 µs
Figure 19. Load Transient
COUT = 10 µF, IOUT = 10 mA to 100 mA in 5 µs
Figure 20. Load Transient
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
10 / 22
DA20230602A1

## Page 11

Detailed Description
Overview
The TPL8031Q series supports the operating range from 3 V to 42 V (45-V maximum transient voltage). Operating with as
low as 3 V allows the TPL8031Q to continue to work well during cold-crank and start-stop conditions.
The TPL8031Q products are 3-μA ultra-low quiescent low dropout voltage linear regulators with 300-mA maximum output
current capability.
With the above features, the TPL8031Q products are the optimal solutions for powering the MCU, CAN/LIN transceivers in
the always-on applications, and the battery-connected applications in the automotive systems.
The TPL8031Q series provides fixed 5-V and 3.3-V output voltage options. The TPL8031Q supports a wide range of output
capacitors from 1 μF to 200 μF with an ESR range from 0.001 Ω to 10 Ω. Also, the TPL8031Q series integrates over-current
protection and over-temperature protection.
Functional Block Diagram
Undervoltage
Lockout
Bandgap
Regulator
Control
Overcurrent
Protection
IN
EN
OUT
Thermal
Shutdown
Vref
GND
Figure 21. Functional Block Diagram
Feature Description
Enable (EN)
The enable pin (EN) is active high. Connect this pin to the GPIO of an external processor or digital logic control circuit to
enable and disable the device. Or connect this pin to the IN pin for self-bias applications.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
11 / 22
DA20230602A1

## Page 12

Under-Voltage Lockout (UVLO)
The TPL8031Q series uses an under-voltage lockout circuit to keep the output shut off until the internal circuitry operates
properly. Refer to the Electrical Characteristics table for UVLO threshold and hysteresis.
Regulated Output Voltage (OUT)
The TPL8031Q series is available in fixed voltage versions of 5 V and 3.3 V. When the input voltage is higher than VOUT(NOM)
+ VDO, the output pin is the regulated output based on the selected voltage version. When the input voltage falls below
VOUT(NOM) + VDO, the output pin tracks the input voltage minus the dropout voltage based on the load current.
Over-Current Protection
The TPL8031Q series integrates an internal current limit that helps to protect the regulator during fault conditions, e.g., the
output is shorted to ground, or the output is forced below VOUT(NOM). The output voltage is not regulated when the device is in
current limit, and VOUT = ICL × RLOAD.
Over-Temperature Protection
The over-temperature protection starts to work when the junction temperature exceeds the thermal shutdown (TSD)
threshold, which turns off the regulator immediately. Until the device cools down and the junction temperature falls below
the thermal shutdown threshold minus thermal shutdown hysteresis, the regulator turns on again. The junction temperature
range should be limited according to the Recommended Operating Conditions table, continuously operating above the
junction temperature range will reduce the device lifetime.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
12 / 22
DA20230602A1

## Page 13

Application and Implementation
Note
Information in the following application sections is not part of the 3PEAK’s component specification and 3PEAK does not
warrant its accuracy or completeness. 3PEAK’s customers are responsible for determining suitability of components for
their purposes. Customers should validate and test their design implementation to confirm system functionality.
Application Information
The TPL8031Q products are 42-V 3-μA ultra-low quiescent low dropout voltage linear regulators with 300-mA maximum
output current capability. The following application schematic shows a typical usage of the TPL8031Q series.
Typical Application
Figure 22 shows the typical application schematic of the TPL8031Q series.
VIN
VOUT
EN
GND
Input
Off On
TPL8031Q
COUT = 10 µF
Output
CIN = 10 µF
Figure 22. Typical Application Circuit
Input Capacitor and Output Capacitor
3PEAK recommends adding a 10-μF or greater capacitor with a 0.1-μF bypass capacitor in parallel at the IN pin to keep the
input voltage stable. The voltage rating of the capacitors must be greater than the maximum input voltage.
To ensure loop stability, the TPL8031Q series requires an output capacitor of 1 μF to 200 μF with an ESR range from 0.001 Ω
to 10 Ω. 3PEAK recommends selecting an X7R type 10-μF ceramic capacitor with low ESR over temperature.
Both input capacitors and output capacitors must be placed as close to the device pins as possible.
Power Dissipation and Thermal Consideration
During normal operation, LDO junction temperature should meet the requirements in the Recommended Operating
Conditions table. Using equations below to calculate the power dissipation and estimate the junction temperature.
The power dissipation can be calculated using the Equation 1.
PD = VIN −VOUT × IOUT + VIN × IGND
(1)
The junction temperature can be estimated using the Equation 2. θJA is the junction-to-ambient thermal resistance.
TJ = TA + PD × θJA
(2)
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
13 / 22
DA20230602A1

## Page 14

Layout
Layout Guideline
•
Both input capacitors and output capacitors must be placed to the device pins as close as possible, and the vias between
capacitors and device power pins must be avoided.
•
It is recommended to bypass the input pin to ground with a 0.1-μF bypass capacitor. The loop area formed by the bypass
capacitor connection, the IN pin, and the GND pin of the system must be as small as possible.
•
It is recommended to use wide and thick copper to minimize I×R drop and heat dissipation.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
14 / 22
DA20230602A1

## Page 15

Tape and Reel Information
Order Number
Package
D1 (mm)
W1 (mm)
A0 (mm)
B0 (mm)
K0 (mm)
P0 (mm)
W0 (mm)
Pin1
Quadrant
TPL803133Q-
DF6R-S
DFN3X3-8
330
17.6
3.3
3.3
1.1
8
12
Q1
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
15 / 22
DA20230602A1

## Page 16

Order Number
Package
D1 (mm)
W1 (mm)
A0 (mm)
B0 (mm)
K0 (mm)
P0 (mm)
W0 (mm)
Pin1
Quadrant
TPL803150Q-
DF6R-S
DFN3X3-8
330
17.6
3.3
3.3
1.1
8
12
Q1
TPL803133Q-
EV1R-S
EMSOP8
330
17.6
5.3
3.4
1.4
8
12
Q1
TPL803150Q-
EV1R-S
EMSOP8
330
17.6
5.3
3.4
1.4
8
12
Q1
TPL803133Q-
ST4R-S
SOT223-3
330
17.6
7.05
7.3
1.9
8
12
Q3
TPL803150Q-
ST4R-S
SOT223-3
330
17.6
7.05
7.3
1.9
8
12
Q3
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
16 / 22
DA20230602A1

### Tables on Page 16

#### Table 1

| rder Number | Package | D1 (mm) | W1 (mm) | A0 (mm) | B0 (mm) | K0 (mm) | P0 (mm) | W0 (mm) | Pin1<br/>Quadrant |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PL803150Q-<br/>F6R-S | DFN3X3-8 | 330 | 17.6 | 3.3 | 3.3 | 1.1 | 8 | 12 | Q1 |
| PL803133Q-<br/>V1R-S | EMSOP8 | 330 | 17.6 | 5.3 | 3.4 | 1.4 | 8 | 12 | Q1 |
| PL803150Q-<br/>V1R-S | EMSOP8 | 330 | 17.6 | 5.3 | 3.4 | 1.4 | 8 | 12 | Q1 |
| PL803133Q-<br/>T4R-S | SOT223-3 | 330 | 17.6 | 7.05 | 7.3 | 1.9 | 8 | 12 | Q3 |
| PL803150Q-<br/>T4R-S | SOT223-3 | 330 | 17.6 | 7.05 | 7.3 | 1.9 | 8 | 12 | Q3 |

## Page 17

Package Outline Dimensions
DFN3X3-8
Symbol
Dimensions 
In Millimeters
MIN
MAX
A
0.900
A1
0.000
0.050
b
0.200
0.300
A3
0.150
0.250
D
E
E2
e
0.650 BSC
L
0.425
0.525
0.800
DFC(DFN3X3-8-F)
Package Outline Dimensions
Dimensions
In Inches
MIN
MAX
0.035
0.000
0.002
0.008
0.012
0.006
0.010
0.026 BSC
0.017
0.021
0.031
D2
2.900
3.100
0.114
0.122
0.053
0.063
0.114
0.122
0.083
0.093
1.350
1.600
2.900
3.100
2.100
2.350
NOTES
1. Do not include mold flash or protrusion.
2. This drawing is subject to change without notice.
3. The many types of E-pad Pin1 signs may appear in the product.
EP
EP
EP
E- Pad Pi n1 Si gns
4. Dimensioning and tolerancing per ASME Y14.5M.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
17 / 22
DA20230602A1

### Tables on Page 17

#### Table 1

| Symbol | Dimensions<br/>In Millimeters |  | Dimensions<br/>In Inches |  |
| --- | --- | --- | --- | --- |
|  | MIN M | AX | MIN | MAX |
| A | 0.800 0.9 | 00 | 0.031 | 0.035 |
| A1 | 0.000 0.0 | 50 | 0.000 | 0.002 |
| b | 0.200 0.3 | 00 | 0.008 | 0.012 |
| A3 | 0.150 0.2 | 50 | 0.006 | 0.010 |
| D | 2.900 3.1 | 00 | 0.114 | 0.122 |
| D2 | 1.350 1.6 | 00 | 0.053 | 0.063 |
| E | 2.900 3.1 | 00 | 0.114 | 0.122 |
| E2 | 2.100 2.3 | 50 | 0.083 | 0.093 |
| e | 0.650 BSC |  | 0.026 BSC |  |
| L | 0.425 0.5 | 25 | 0.017 | 0.021 |

## Page 18

EMSOP8
Symbol
Dimensions 
In Millimeters
MIN
MAX
A
1.100
A1
0.020
0.150
A2
0.750
0.950
b
0.250
0.380
c
0.090
0.230
D
2.900
3.100
E
4.700
5.100
E1
2.900
3.100
e
0.650 BSC
L
0.400
0.800
θ
0
8
0.800
EV1(EMSOP-8-B)
Package Outline Dimensions
Dimensions
In Inches
MIN
MAX
0.043
0.001
0.006
0.030
0.037
0.010
0.015
0.004
0.009
0.114
0.122
0.185
0.201
0.114
0.122
0.026 BSC
0.016
0.031
0
8
0.031
NOTES
1. Do not include mold flash or protrusion.
2. This drawing is subject to change without notice.
D1
1.920
2.220
0.076
0.087
E2
1.450
1.750
0.057
0.069
D
A2
A
A1
b
e
E
E1
θ
c
D1
E2
Epad
θ
L
c
3. Dimensioning and toleracing per ASME Y14.5M.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
18 / 22
DA20230602A1

### Tables on Page 18

#### Table 1

| Symbol | Dimensions<br/>In Millimeters |  | Dimensions<br/>In Inches |  |
| --- | --- | --- | --- | --- |
|  | MIN | MAX | MIN | MAX |
| A | 0.800 | 1.100 | 0.031 | 0.043 |
| A1 | 0.020 | 0.150 0 | .001 | 0.006 |
| A2 | 0.750 | 0.950 0 | .030 | 0.037 |
| b | 0.250 | 0.380 0 | .010 | 0.015 |
| c | 0.090 | 0.230 0 | .004 | 0.009 |
| D | 2.900 | 3.100 0 | .114 | 0.122 |
| D1 | 1.920 | 2.220 0 | .076 | 0.087 |
| E | 4.700 | 5.100 0 | .185 | 0.201 |
| E1 | 2.900 | 3.100 0 | .114 | 0.122 |
| E2 | 1.450 | 1.750 0 | .057 | 0.069 |
| e | 0.650 BSC |  | 0.026 BSC |  |
| L | 0.400 | 0.800 0 | .016 | 0.031 |
| θ | 0 | 8 | 0 | 8 |

## Page 19

SOT223-3
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
19 / 22
DA20230602A1

## Page 20

Order Information
Order Number
Operating Temperature
Range
Package
Marking Information
MSL
Transport Media, Quantity
Eco Plan
TPL803133Q-DF6R-S
−40 to 150°C
DFN3X3-8
L3133
MSL3
4,000
Green
TPL803150Q-DF6R-S
−40 to 150°C
DFN3X3-8
L3150
MSL3
4,000
Green
TPL803133Q-EV1R-S
−40 to 150°C
EMSOP8
L3133
MSL2
3,000
Green
TPL803150Q-EV1R-S
−40 to 150°C
EMSOP8
L3150
MSL2
3,000
Green
TPL803133Q-ST4R-S
−40 to 150°C
SOT223-3
LDC
MSL3
4,000
Green
TPL803150Q-ST4R-S
−40 to 150°C
SOT223-3
LDD
MSL3
4,000
Green
Green: 3PEAK defines "Green" to mean RoHS compatible and free of halogen substances.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout Linear Regulator
www.3peak.com
20 / 22
DA20230602A1

### Tables on Page 20

#### Table 1

| Order Number | Operating Temperature<br/>Range | Package | Marking Information | MSL | Transport Media, Quantity | Eco Plan |
| --- | --- | --- | --- | --- | --- | --- |
| TPL803133Q-DF6R-S | −40 to 150°C | DFN3X3-8 | L3133 | MSL3 | 4,000 | Green |
| TPL803150Q-DF6R-S | −40 to 150°C | DFN3X3-8 | L3150 | MSL3 | 4,000 | Green |
| TPL803133Q-EV1R-S | −40 to 150°C | EMSOP8 | L3133 | MSL2 | 3,000 | Green |
| TPL803150Q-EV1R-S | −40 to 150°C | EMSOP8 | L3150 | MSL2 | 3,000 | Green |
| TPL803133Q-ST4R-S | −40 to 150°C | SOT223-3 | LDC | MSL3 | 4,000 | Green |
| TPL803150Q-ST4R-S | −40 to 150°C | SOT223-3 | LDD | MSL3 | 4,000 | Green |

## Page 21

IMPORTANT NOTICE AND DISCLAIMER
Copyright© 3PEAK 2012-2025. All rights reserved.
Trademarks. Any of the 思瑞浦 or 3PEAK trade names, trademarks, graphic marks, and domain names contained in
this document /material are the property of 3PEAK. You may NOT reproduce, modify, publish, transmit or distribute any
Trademark without the prior written consent of 3PEAK.
Performance Information. Performance tests or performance range contained in this document/material are either results
of design simulation or actual tests conducted under designated testing environment. Any variation in testing environment or
simulation environment, including but not limited to testing method, testing process or testing temperature, may affect actual
performance of the product.
Disclaimer. 3PEAK provides technical and reliability data (including data sheets), design resources (including reference
designs), application or other design recommendations, networking tools, security information and other resources "As Is".
3PEAK makes no warranty as to the absence of defects, and makes no warranties of any kind, express or implied, including
without limitation, implied warranties as to merchantability, fitness for a particular purpose or non-infringement of any third-
party’s intellectual property rights. Unless otherwise specified in writing, products supplied by 3PEAK are not designed to
be used in any life-threatening scenarios, including critical medical applications, automotive safety-critical systems, aviation,
aerospace, or any situations where failure could result in bodily harm, loss of life, or significant property damage. 3PEAK
disclaims all liability for any such unauthorized use.
TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
www.3peak.com
21 / 22
DA20230602A1

## Page 22

TPL8031Q-S
42-V 300-mA Wide-input Ultra-low Quiescent Current Low-Dropout
Linear Regulator
This page intentionally left blank
www.3peak.com
22 / 22
DA20230602A1
