# NCA9617A_Datasheet_EN_1.0

Source: NCA9617A_Datasheet_EN_1.0.pdf
Pages: 16

## Page 1

Copyright ©  2022, NOVOSENSE     
Page 1 Product
Two-Channel Bidirectional I2C Buffer
Support for Standard Mode, Fast Mode (400 kHz), and Fast Mode+ (1 MHz) I2C Operation
Operating Supply Voltage Range of 0.8 V to 5.5 V on A-Side
Operating Supply Voltage Range of 2.2 V to 5.5 V on B-Side
Voltage-Level Translation From 0.8 V to 5.5 V and 2.2 V to 5.5 V
Active-High Repeater-Enable Input
Open-Drain I2C I/O
5.5-V Tolerant I2C and Enable Input Support
Mixed-Mode Signal Operation
Lockup-Free Operation
Support for Clock Stretching and Multiple Master
Arbitration Across TheDevice
Latch-Up Performance Exceeds 100 mA Per JESD 78, Class II
ESD Protection Exceeds JESD 22–5500-V Human-Body Model (
Servers
Routers (Telecom Switching Equipment)
Industrial Equipment
Products With Many I2C Slaves and/or Long PCBDevice Info
1
2
3
4
5
6
7
8

## Page 2

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 2 
 INDEX1. PIN CONFIGURATION AND FUNCTIONS........................................................................................................

## Page 3

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 3 
 1.
 Pin Configuration and FunctionsFigure 1. 1NCA9617A PackageTable 1. 1Pin DescriptionSymbolPinDescrip
 Absolute Maximum RatingsParametersSymbolMinTypMaxUnitConditionsSupply VoltageVCCA-0.57VV
℃Storage TemperatureTstg-65150
℃Electrostatic dischargeHBM±5500V
1
2
3
4
5
6
7
8

## Page 4

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 4 
 3.
 Recommended Operating ConditionsParametersSymbolMinTypMaxUnitSupply voltage, A-side busV
 Thermal InformationParametersSymbolMSOP-8UnitJunction-to-ambient thermal resistanceθJA171.8
℃/WJunction-to-case
（top）61.2
℃/WJunction-to-boar
℃/W

## Page 5

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 5 
 5.
 Specifications5.1.
 Electrical Characteristics(VCCA=0.8V~5.5V, VCCB=2.2V~5.5V, TA=-40°Cto 105°C. Unless otherwise noted, Typica

## Page 6

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 6 
 ParametersSymbol

## Page 7

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 7 
 5.2.
 Dynamic Characteristics(VCCA=0.8V~5.5V, VCCB=2.2V~5.5V, TA=-40°C to 105°C. Unless otherwise noted, Typical values 
℃, unless otherwise noted.5.The tPLH2delay data from port B to port A is measured at 0.45V on 
 Parameter Measurement InformationFigure 5. 1Propagation delay and transition timesport B to port AFigure 5. 2
30%
70%ParameterSymbolmin

## Page 8

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 8 
 Figure 5. 3Propagat
 
DUT

## Page 9

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 9 
 6.
 Detailed Description6.1.
 OverviewThe NCA9617Aenables I2C-bus or SMBus translation down to VCCAas low as 0.8V without degradation of syste
 Functional Block Diagram  Figure 6. 1NCA9617A Functional block6.3.
 EnableThe EN pin is active HIGH with thresholds referenced to VCCBand an internal pull-up to VCCBthat maintains the device ac
 I2C-Bus SystemAs with the standard I2C-bus system, pull-up resistors are required to provide the logic HIGH levelson
 
VCCB

## Page 10

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 10 
 7.
 Application and ImplementationA typical application is shown in Figure 7.1. In this example, the system mas
4
5
6
7
8
NCA9617A
3
2
1
BUS A
BUS B

## Page 11

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 11 
 Figure 7. 2Typical st
VCCA
4
5
6
7
8
3
2
1

## Page 12

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 12 
 Figure 7. 5Bus A (0.8
 Layout8.1.
 Layout GuidelinesThe recommended decoupling capacitors should be placed as close to the VCCAand VCCBpins of the NCA9
 
5
6
7
8
4
3
2
1

## Page 13

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 13 
 9.
 Package InformationFigure 9. 1Package outline for MSOP8LAND PATTERN EXAMPLE (mm)

## Page 14

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 14 
 SOLDER MASK DETAIL
 Order informationPart NumberPinsTemperatureMSLPackage TypePackage DrawingSPQNCA9617A-DMSR8
℃3MSOPMSOP400011.
 Documentation SupportPart NumberProduct FolderDatasheetTechnical DocumentsIsolator selection guideNC

## Page 15

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 15 
 12.
 Tape and Reel InformationA-AB-B  Figure 12. 1Tape and Reel Information of MSOP813.
 Revision historyRevision DescriptionDate1.0Initial version2022/12/10
 
Pocket Quadrants
User Direction of Feed
QUADRANT ASSIGNMENTS FOR PIN 1 ORIENTATION IN TAPE 
Z1
Z2
Z3
Z4
Z1
Z2
Z3
Z4
Sprocket Holes

## Page 16

NCA9617A 
Datasheet (EN) 1.0 
 
Copyright ©  2022, NOVOSENSE           
 
Page 16 
 IMPORTANT N
