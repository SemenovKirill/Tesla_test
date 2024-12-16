#include <Tesla_IPS_ST7789.h>

#include <microLED.h>
//#include <Arduino_ST7789.h>  // Hardware-specific library for ST7789 (with or without CS pin)
#include <TeslaTM1637.h>
#include <microDS3231.h>
#include <math.h>
//#include <PWMrelay.h>


#define IPS_DC 10
#define IPS_RST 4
#define IPS_MOSI 12  // for hardware SPI data pin (all of available pins)
#define IPS_SCLK 13  // for hardware SPI sclk pin (all of available pins)

#define LED_DISP_DIO 7
#define LED_DISP_CLK 8

#define STRIP_PIN 2  // пин ленты
#define HALL_PIN 3
#define MOTOR 5
#define RLED_PIN 6
#define GLED_PIN 9
#define B1_PIN A0
#define B2_PIN A2
#define B3_PIN A7
#define BUZZ_PIN 11
#define TERM_PIN A3
#define POT_PIN A1
#define LDR_PIN A6

#define COLUMN 1
#define TAB 40

#define NUMLEDS 7
#define COLOR_DEBTH 3

#define EMPTY_COL 10
#define DOTS 11


microLED<NUMLEDS, STRIP_PIN, MLED_NO_CLOCK, LED_WS2812, ORDER_GRB, CLI_AVER, SAVE_MILLIS> strip;
MicroDS3231 rtc;
TM1637Display LED_display(LED_DISP_CLK, LED_DISP_DIO);
IPS_display ips(IPS_DC, IPS_RST, IPS_MOSI, IPS_SCLK);
//PWMrelay relay(MOTOR);

int collect_nums(int num, int row, int col);
void plotter(int code, int len = 5);



void setup() {
  // put your setup code here, to run once:
  pinMode(MOTOR, OUTPUT);
  pinMode(RLED_PIN, OUTPUT);
  pinMode(GLED_PIN, OUTPUT);
  pinMode(BUZZ_PIN, OUTPUT);
  pinMode(HALL_PIN, INPUT_PULLUP);
  pinMode(B1_PIN, INPUT_PULLUP);
  pinMode(B2_PIN, INPUT_PULLUP);
  pinMode(B3_PIN, INPUT_PULLUP);
  pinMode(TERM_PIN, INPUT);
  pinMode(POT_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);

  LED_display.clear();
  LED_display.showNumber(8888);
  delay(1000);
  LED_display.clear();

  ips.begin();  // initialize a ST7789 chip, 240x240 pixels
  ips.fillScreen(BLACK);
  ips.setRotation(1);
  ips.setTextSize(5);
  ips.setCursor(0, 0);
  ips.setTextColor(RED);
  ips.print("START");
  delay(500);
  ips.setCursor(0, 0);
  ips.setTextColor(BLACK);
  ips.print("START");

  rtc.begin();

  strip.clear();
  strip.show();


  Serial.begin(9600);


  ips.setCursor(10, 0);
  ips.setTextSize(2);
  ips.setTextColor(CYAN);
  ips.print(utf8rus("Будильник:"));
  ips.setCursor(170, 0);
  ips.setTextColor(RED);
  ips.print(utf8rus("ВЫКЛ"));

  ips.setTextColor(CYAN);
  ips.setTextSize(3);
  ips.setCursor(100, 45);
  ips.print(utf8rus("градуса"));


  ips.drawRect(0, 70, 240, 2, WHITE);
  ips.drawRect(0, 75, 240, 2, WHITE);

  ips.setCursor(20, 105);
  ips.setTextSize(3);
  ips.setTextColor(YELLOW);
  ips.print(utf8rus("НАПОМИНАНИЕ"));
}


int act_time[7];
int buzz_h = 21;
int buzz_m = 42;
bool buzz_on = 0;


void loop() {
  //Serial.println(digitalRead(HALL_PIN));
  
  if (digitalRead(HALL_PIN) == 0)  //вывод времени на голограмму
  {
    //Serial.print("in    ");
    //Serial.println(digitalRead(HALL_PIN));
    for (int t = 0; t < TAB; ++t)
      plotter(EMPTY_COL, 1);
    for (int i = 0; i < 4; ++i) {
      //Serial.print(act_time[i]);
      plotter(EMPTY_COL, 1);
      plotter(act_time[i]);
      if (i == 1) {
        plotter(EMPTY_COL, 1);
        plotter(DOTS, 3);
      }
    }  //Serial.println();
  }

  if (act_time[5] != rtc.getSeconds() % 10)  //вывод инфы на ips и led дисплеи раз в секунду
  {
    act_time[0] = int(rtc.getHours() / 10);
    act_time[1] = rtc.getHours() % 10;
    act_time[2] = int(rtc.getMinutes() / 10);
    act_time[3] = rtc.getMinutes() % 10;
    act_time[4] = int(rtc.getSeconds() / 10);
    act_time[5] = rtc.getSeconds() % 10;

    LED_display.setBrightness(map(analogRead(LDR_PIN), 100, 800, 6, 0));
    LED_display.showNumber(rtc.getMinutes(), 0, 2); //rtc.getDate(), 0, 2);
    LED_display.showNumber(rtc.getSeconds(), 2, 2); //rtc.getMonth(), 2, 2);

  }


  if ((act_time[4] + act_time[5]) == 0) {
    ips.setTextSize(5);

    ips.setCursor(20, 32);
    ips.setTextColor(BLACK);
    ips.print(act_time[6]);

    float voltage = analogRead(TERM_PIN) * 5.0 / 1023.0;
    float temperature = 1.0 / (log(voltage / 2.5) / 4300.0 + 1.0 / 298.0) - 273.0;

    act_time[6] = temperature;

    ips.setCursor(20, 32);
    ips.setTextColor(WHITE);
    ips.print(act_time[6]);

    //LED_display.showNumber(rtc.getMinutes(), 0, 2); //rtc.getDate(), 0, 2);
    //LED_display.showNumber(rtc.getSeconds(), 2, 2); //rtc.getMonth(), 2, 2);


    ips.setCursor(0, 145);
    ips.setTextColor(CYAN);
    ips.setTextSize(2);
    ips.print(utf8rus("Сегодня в Куркино в 15:00 состоится педсовет"));
    
    buzz_on = (buzz_h == rtc.getHours()) and (buzz_m == rtc.getMinutes());
    Serial.print("Buzzer: ");
    Serial.print(buzz_on);
    Serial.print("\tTime: ");
    Serial.println(rtc.getTimeString());
  }


  if (!digitalRead(B1_PIN) or !digitalRead(B2_PIN)) {
    buzz_on = false;
  }

  if (buzz_on) {
    for (int i = 0; i < 3; ++i) {
      tone(BUZZ_PIN, 4000);
      delay(100);
      noTone(BUZZ_PIN);
      delay(100);
    }
    delay(300);
  } else {
    noTone(BUZZ_PIN);
  }

  //analogWrite(MOTOR, map(analogRead(POT_PIN), 0, 1023, 0, 255));
}
